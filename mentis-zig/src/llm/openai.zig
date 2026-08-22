const std = @import("std");
const iface = @import("interface.zig");

pub const OpenAIProvider = struct {
    base_url: []const u8,
    api_key: []const u8,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator, base_url: []const u8, api_key: []const u8) OpenAIProvider {
        return .{ .base_url = base_url, .api_key = api_key, .allocator = allocator };
    }

    pub fn chat(
        self: *OpenAIProvider,
        messages: []const iface.Message,
        tools: []const iface.ToolDef,
        opts: iface.ChatOptions,
        on_chunk: ?iface.StreamChunkFn,
        ctx: ?*anyopaque,
    ) !iface.ChatResult {
        const allocator = self.allocator;
        const url = try std.fmt.allocPrint(allocator, "{s}/v1/chat/completions", .{self.base_url});
        defer allocator.free(url);

        var body = std.ArrayList(u8).init(allocator);
        defer body.deinit();
        const w = body.writer();

        try w.print("{{\"model\":\"{s}\",\"max_tokens\":{d},\"temperature\":{d:.2},\"stream\":{s}",
            .{ opts.model, opts.max_tokens, opts.temperature, if (on_chunk != null) "true" else "false" });

        try w.writeAll(",\"messages\":[");
        if (opts.system) |sys| {
            try w.print("{{\"role\":\"system\",\"content\":\"{s}\"}},", .{sys});
        }
        for (messages, 0..) |msg, i| {
            if (i > 0) try w.writeByte(',');
            var text_content = std.ArrayList(u8).init(allocator);
            defer text_content.deinit();
            for (msg.content) |block| {
                if (block == .text) try text_content.appendSlice(block.text);
            }
            try w.print("{{\"role\":\"{s}\",\"content\":\"{s}\"}}",
                .{ msg.role.toString(), text_content.items });
        }
        try w.writeByte(']');

        if (tools.len > 0) {
            try w.writeAll(",\"tools\":[");
            for (tools, 0..) |tool, i| {
                if (i > 0) try w.writeByte(',');
                try w.print("{{\"type\":\"function\",\"function\":{{\"name\":\"{s}\",\"description\":\"{s}\",\"parameters\":{s}}}}}",
                    .{ tool.name, tool.description, tool.input_schema_json });
            }
            try w.writeByte(']');
        }
        try w.writeByte('}');

        const body_bytes = try body.toOwnedSlice();
        defer allocator.free(body_bytes);

        var client = std.http.Client{ .allocator = allocator };
        defer client.deinit();
        const uri = try std.Uri.parse(url);
        var hbuf: [32 * 1024]u8 = undefined;
        const auth = try std.fmt.allocPrint(allocator, "Bearer {s}", .{self.api_key});
        defer allocator.free(auth);
        const headers = [_]std.http.Header{
            .{ .name = "content-type", .value = "application/json" },
            .{ .name = "authorization", .value = auth },
        };
        var req = try client.open(.POST, uri, .{ .server_header_buffer = &hbuf, .extra_headers = &headers });
        defer req.deinit();
        req.transfer_encoding = .{ .content_length = body_bytes.len };
        try req.send();
        try req.writeAll(body_bytes);
        try req.finish();
        try req.wait();

        if (req.response.status != .ok) return error.ApiError;

        var text_buf = std.ArrayList(u8).init(allocator);
        var tool_calls = std.ArrayList(iface.ToolUse).init(allocator);
        var input_tokens: u32 = 0;
        var output_tokens: u32 = 0;
        var stop_reason = iface.StopReason.end_turn;

        if (on_chunk != null) {
            var leftover = std.ArrayList(u8).init(allocator);
            defer leftover.deinit();
            var rdbuf: [4096]u8 = undefined;
            while (true) {
                const n = try req.reader().read(&rdbuf);
                if (n == 0) break;
                try leftover.appendSlice(rdbuf[0..n]);
                while (std.mem.indexOfScalar(u8, leftover.items, '\n')) |nl| {
                    const line = std.mem.trim(u8, leftover.items[0..nl], " \r");
                    if (std.mem.startsWith(u8, line, "data: ")) {
                        const data = line[6..];
                        if (!std.mem.eql(u8, data, "[DONE]")) {
                            const parsed = std.json.parseFromSlice(std.json.Value, allocator, data, .{}) catch {
                                const rem2 = leftover.items[nl + 1 ..];
                                try leftover.replaceRange(0, leftover.items.len, rem2);
                                continue;
                            };
                            defer parsed.deinit();
                            if (parsed.value.object.get("choices")) |choices| {
                                for (choices.array.items) |choice| {
                                    if (choice.object.get("delta")) |delta| {
                                        if (delta.object.get("content")) |content| {
                                            if (content != .null) {
                                                try text_buf.appendSlice(content.string);
                                                on_chunk.?(content.string, ctx);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    const rem = leftover.items[nl + 1 ..];
                    try leftover.replaceRange(0, leftover.items.len, rem);
                }
            }
        } else {
            const full = try req.reader().readAllAlloc(allocator, 10 * 1024 * 1024);
            defer allocator.free(full);
            const parsed = try std.json.parseFromSlice(std.json.Value, allocator, full, .{});
            defer parsed.deinit();
            const obj = parsed.value.object;
            if (obj.get("choices")) |choices| {
                for (choices.array.items) |choice| {
                    const msg_obj = (choice.object.get("message") orelse continue).object;
                    if (msg_obj.get("content")) |content| {
                        if (content != .null) try text_buf.appendSlice(content.string);
                    }
                    if (msg_obj.get("tool_calls")) |tcs| {
                        for (tcs.array.items) |tc| {
                            const tcobj = tc.object;
                            const fn_obj = (tcobj.get("function") orelse continue).object;
                            try tool_calls.append(.{
                                .id = try allocator.dupe(u8, (tcobj.get("id") orelse continue).string),
                                .name = try allocator.dupe(u8, (fn_obj.get("name") orelse continue).string),
                                .input_json = try allocator.dupe(u8, (fn_obj.get("arguments") orelse continue).string),
                            });
                        }
                        stop_reason = .tool_use;
                    }
                }
            }
            if (obj.get("usage")) |usage| {
                if (usage.object.get("prompt_tokens")) |it| input_tokens = @intCast(it.integer);
                if (usage.object.get("completion_tokens")) |ot| output_tokens = @intCast(ot.integer);
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
