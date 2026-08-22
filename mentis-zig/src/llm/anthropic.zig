const std = @import("std");
const iface = @import("interface.zig");

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

pub const AnthropicProvider = struct {
    api_key: []const u8,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator, api_key: []const u8) AnthropicProvider {
        return .{ .api_key = api_key, .allocator = allocator };
    }

    pub fn chat(
        self: *AnthropicProvider,
        messages: []const iface.Message,
        tools: []const iface.ToolDef,
        opts: iface.ChatOptions,
        on_chunk: ?iface.StreamChunkFn,
        ctx: ?*anyopaque,
    ) !iface.ChatResult {
        const allocator = self.allocator;

        // Build JSON body
        var body = std.ArrayList(u8).init(allocator);
        defer body.deinit();
        const writer = body.writer();

        try writer.print("{{\"model\":\"{s}\",\"max_tokens\":{d},\"stream\":{s}",
            .{ opts.model, opts.max_tokens, if (on_chunk != null) "true" else "false" });

        if (opts.system) |sys| {
            try writer.print(",\"system\":\"{s}\"", .{sys});
        }

        // Messages
        try writer.writeAll(",\"messages\":[");
        for (messages, 0..) |msg, i| {
            if (i > 0) try writer.writeByte(',');
            try writer.print("{{\"role\":\"{s}\",\"content\":[", .{msg.role.toString()});
            for (msg.content, 0..) |block, bi| {
                if (bi > 0) try writer.writeByte(',');
                switch (block) {
                    .text => |t| try writer.print("{{\"type\":\"text\",\"text\":\"{s}\"}}", .{t}),
                    .tool_use => |tu| try writer.print("{{\"type\":\"tool_use\",\"id\":\"{s}\",\"name\":\"{s}\",\"input\":{s}}}", .{ tu.id, tu.name, tu.input_json }),
                    .tool_result => |tr| try writer.print("{{\"type\":\"tool_result\",\"tool_use_id\":\"{s}\",\"content\":\"{s}\",\"is_error\":{s}}}", .{ tr.tool_use_id, tr.content, if (tr.is_error) "true" else "false" }),
                }
            }
            try writer.writeAll("]}");
        }
        try writer.writeAll("]");

        // Tools
        if (tools.len > 0) {
            try writer.writeAll(",\"tools\":[");
            for (tools, 0..) |tool, i| {
                if (i > 0) try writer.writeByte(',');
                try writer.print("{{\"name\":\"{s}\",\"description\":\"{s}\",\"input_schema\":{s}}}",
                    .{ tool.name, tool.description, tool.input_schema_json });
            }
            try writer.writeAll("]");
        }
        try writer.writeByte('}');

        const body_bytes = try body.toOwnedSlice();
        defer allocator.free(body_bytes);

        // HTTP request
        const auth_header = try std.fmt.allocPrint(allocator, "x-api-key: {s}", .{self.api_key});
        defer allocator.free(auth_header);

        var client = std.http.Client{ .allocator = allocator };
        defer client.deinit();

        const uri = try std.Uri.parse(API_URL);
        var server_header_buf: [32 * 1024]u8 = undefined;

        const extra_headers = [_]std.http.Header{
            .{ .name = "content-type", .value = "application/json" },
            .{ .name = "x-api-key", .value = self.api_key },
            .{ .name = "anthropic-version", .value = API_VERSION },
        };

        var req = try client.open(.POST, uri, .{
            .server_header_buffer = &server_header_buf,
            .extra_headers = &extra_headers,
        });
        defer req.deinit();

        req.transfer_encoding = .{ .content_length = body_bytes.len };
        try req.send();
        try req.writeAll(body_bytes);
        try req.finish();
        try req.wait();

        if (req.response.status != .ok) {
            const err_body = try req.reader().readAllAlloc(allocator, 64 * 1024);
            defer allocator.free(err_body);
            std.log.err("Anthropic API error {}: {s}", .{ req.response.status, err_body });
            return error.ApiError;
        }

        if (on_chunk != null) {
            return parseSSEStream(allocator, &req, on_chunk.?, ctx);
        } else {
            return parseResponse(allocator, &req);
        }
    }

    fn parseSSEStream(
        allocator: std.mem.Allocator,
        req: anytype,
        on_chunk: iface.StreamChunkFn,
        ctx: ?*anyopaque,
    ) !iface.ChatResult {
        var text_buf = std.ArrayList(u8).init(allocator);
        errdefer text_buf.deinit();
        var tool_calls = std.ArrayList(iface.ToolUse).init(allocator);
        errdefer tool_calls.deinit();
        var input_tokens: u32 = 0;
        var output_tokens: u32 = 0;
        var stop_reason = iface.StopReason.end_turn;
        var current_tool: ?*iface.ToolUse = null;
        var tool_input_buf = std.ArrayList(u8).init(allocator);
        defer tool_input_buf.deinit();

        var line_buf = std.ArrayList(u8).init(allocator);
        defer line_buf.deinit();
        const reader = req.reader();

        var read_buf: [4096]u8 = undefined;
        var leftover = std.ArrayList(u8).init(allocator);
        defer leftover.deinit();

        while (true) {
            const n = try reader.read(&read_buf);
            if (n == 0) break;
            try leftover.appendSlice(read_buf[0..n]);

            // Process complete lines
            while (std.mem.indexOfScalar(u8, leftover.items, '\n')) |nl| {
                const line = leftover.items[0..nl];
                const trimmed = std.mem.trimRight(u8, line, "\r");

                if (std.mem.startsWith(u8, trimmed, "data: ")) {
                    const data = trimmed[6..];
                    if (std.mem.eql(u8, data, "[DONE]")) break;
                    parseSSEEvent(allocator, data, &text_buf, &tool_calls, &current_tool, &tool_input_buf, on_chunk, ctx, &input_tokens, &output_tokens, &stop_reason) catch {};
                }

                const remaining = leftover.items[nl + 1 ..];
                try leftover.replaceRange(0, leftover.items.len, remaining);
            }
        }

        if (current_tool) |tc| {
            tc.input_json = try tool_input_buf.toOwnedSlice();
        }

        return .{
            .text = try text_buf.toOwnedSlice(),
            .tool_calls = try tool_calls.toOwnedSlice(),
            .stop_reason = stop_reason,
            .input_tokens = input_tokens,
            .output_tokens = output_tokens,
            .allocator = allocator,
        };
    }

    fn parseSSEEvent(
        allocator: std.mem.Allocator,
        data: []const u8,
        text_buf: *std.ArrayList(u8),
        tool_calls: *std.ArrayList(iface.ToolUse),
        current_tool: *?*iface.ToolUse,
        tool_input_buf: *std.ArrayList(u8),
        on_chunk: iface.StreamChunkFn,
        ctx: ?*anyopaque,
        input_tokens: *u32,
        output_tokens: *u32,
        stop_reason: *iface.StopReason,
    ) !void {
        const parsed = std.json.parseFromSlice(std.json.Value, allocator, data, .{}) catch return;
        defer parsed.deinit();
        const obj = parsed.value.object;

        const event_type = if (obj.get("type")) |t| t.string else return;

        if (std.mem.eql(u8, event_type, "content_block_delta")) {
            const delta = (obj.get("delta") orelse return).object;
            const delta_type = (delta.get("type") orelse return).string;
            if (std.mem.eql(u8, delta_type, "text_delta")) {
                const chunk = (delta.get("text") orelse return).string;
                try text_buf.appendSlice(chunk);
                on_chunk(chunk, ctx);
            } else if (std.mem.eql(u8, delta_type, "input_json_delta")) {
                const chunk = (delta.get("partial_json") orelse return).string;
                try tool_input_buf.appendSlice(chunk);
            }
        } else if (std.mem.eql(u8, event_type, "content_block_start")) {
            const block = (obj.get("content_block") orelse return).object;
            const block_type = (block.get("type") orelse return).string;
            if (std.mem.eql(u8, block_type, "tool_use")) {
                const id = (block.get("id") orelse return).string;
                const name = (block.get("name") orelse return).string;
                tool_input_buf.clearRetainingCapacity();
                try tool_calls.append(.{
                    .id = try allocator.dupe(u8, id),
                    .name = try allocator.dupe(u8, name),
                    .input_json = try allocator.dupe(u8, ""),
                });
                current_tool.* = &tool_calls.items[tool_calls.items.len - 1];
            }
        } else if (std.mem.eql(u8, event_type, "content_block_stop")) {
            if (current_tool.*) |tc| {
                allocator.free(tc.input_json);
                tc.input_json = try tool_input_buf.toOwnedSlice();
                current_tool.* = null;
            }
        } else if (std.mem.eql(u8, event_type, "message_delta")) {
            const delta = (obj.get("delta") orelse return).object;
            if (delta.get("stop_reason")) |sr| {
                if (std.mem.eql(u8, sr.string, "tool_use")) stop_reason.* = .tool_use;
                if (std.mem.eql(u8, sr.string, "max_tokens")) stop_reason.* = .max_tokens;
            }
            if (obj.get("usage")) |usage| {
                const uobj = usage.object;
                if (uobj.get("output_tokens")) |ot| output_tokens.* = @intCast(ot.integer);
            }
        } else if (std.mem.eql(u8, event_type, "message_start")) {
            if (obj.get("message")) |msg| {
                if (msg.object.get("usage")) |usage| {
                    const uobj = usage.object;
                    if (uobj.get("input_tokens")) |it| input_tokens.* = @intCast(it.integer);
                }
            }
        }
    }

    fn parseResponse(allocator: std.mem.Allocator, req: anytype) !iface.ChatResult {
        const body = try req.reader().readAllAlloc(allocator, 10 * 1024 * 1024);
        defer allocator.free(body);

        const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{});
        defer parsed.deinit();
        const obj = parsed.value.object;

        var text_buf = std.ArrayList(u8).init(allocator);
        var tool_calls = std.ArrayList(iface.ToolUse).init(allocator);
        var input_tokens: u32 = 0;
        var output_tokens: u32 = 0;
        var stop_reason = iface.StopReason.end_turn;

        if (obj.get("usage")) |usage| {
            const uobj = usage.object;
            if (uobj.get("input_tokens")) |it| input_tokens = @intCast(it.integer);
            if (uobj.get("output_tokens")) |ot| output_tokens = @intCast(ot.integer);
        }
        if (obj.get("stop_reason")) |sr| {
            if (std.mem.eql(u8, sr.string, "tool_use")) stop_reason = .tool_use;
            if (std.mem.eql(u8, sr.string, "max_tokens")) stop_reason = .max_tokens;
        }
        if (obj.get("content")) |content| {
            for (content.array.items) |block| {
                const bobj = block.object;
                const btype = (bobj.get("type") orelse continue).string;
                if (std.mem.eql(u8, btype, "text")) {
                    try text_buf.appendSlice((bobj.get("text") orelse continue).string);
                } else if (std.mem.eql(u8, btype, "tool_use")) {
                    const id = (bobj.get("id") orelse continue).string;
                    const name = (bobj.get("name") orelse continue).string;
                    var input_buf = std.ArrayList(u8).init(allocator);
                    try std.json.stringify((bobj.get("input") orelse continue), .{}, input_buf.writer());
                    try tool_calls.append(.{
                        .id = try allocator.dupe(u8, id),
                        .name = try allocator.dupe(u8, name),
                        .input_json = try input_buf.toOwnedSlice(),
                    });
                }
            }
        }

        return .{
            .text = try text_buf.toOwnedSlice(),
            .tool_calls = try tool_calls.toOwnedSlice(),
            .stop_reason = stop_reason,
            .input_tokens = input_tokens,
            .output_tokens = output_tokens,
            .allocator = allocator,
        };
    }
};
