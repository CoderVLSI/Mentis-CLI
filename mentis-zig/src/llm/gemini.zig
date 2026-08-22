const std = @import("std");
const iface = @import("interface.zig");

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

pub const GeminiProvider = struct {
    api_key: []const u8,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator, api_key: []const u8) GeminiProvider {
        return .{ .api_key = api_key, .allocator = allocator };
    }

    pub fn chat(
        self: *GeminiProvider,
        messages: []const iface.Message,
        tools: []const iface.ToolDef,
        opts: iface.ChatOptions,
        on_chunk: ?iface.StreamChunkFn,
        ctx: ?*anyopaque,
    ) !iface.ChatResult {
        const allocator = self.allocator;
        const endpoint = if (on_chunk != null) "streamGenerateContent" else "generateContent";
        const url = try std.fmt.allocPrint(allocator, "{s}/{s}:{s}?key={s}&alt=sse",
            .{ BASE_URL, opts.model, endpoint, self.api_key });
        defer allocator.free(url);

        var body = std.ArrayList(u8).init(allocator);
        defer body.deinit();
        const w = body.writer();

        try w.print("{{\"generationConfig\":{{\"maxOutputTokens\":{d},\"temperature\":{d:.2}}}",
            .{ opts.max_tokens, opts.temperature });

        if (opts.system) |sys| {
            try w.print(",\"systemInstruction\":{{\"parts\":[{{\"text\":\"{s}\"}}]}}", .{sys});
        }

        // Build contents array
        try w.writeAll(",\"contents\":[");
        for (messages, 0..) |msg, i| {
            if (msg.role == .system) continue;
            if (i > 0) try w.writeByte(',');
            const role = if (msg.role == .user) "user" else "model";
            try w.print("{{\"role\":\"{s}\",\"parts\":[", .{role});
            for (msg.content, 0..) |block, bi| {
                if (bi > 0) try w.writeByte(',');
                switch (block) {
                    .text => |t| try w.print("{{\"text\":\"{s}\"}}", .{t}),
                    .tool_use => |tu| try w.print("{{\"functionCall\":{{\"name\":\"{s}\",\"args\":{s}}}}}", .{ tu.name, tu.input_json }),
                    .tool_result => |tr| try w.print("{{\"functionResponse\":{{\"name\":\"tool\",\"response\":{{\"output\":\"{s}\"}}}}}}", .{tr.content}),
                }
            }
            try w.writeAll("]}");
        }
        try w.writeByte(']');

        // Tools
        if (tools.len > 0) {
            try w.writeAll(",\"tools\":[{\"functionDeclarations\":[");
            for (tools, 0..) |tool, i| {
                if (i > 0) try w.writeByte(',');
                try w.print("{{\"name\":\"{s}\",\"description\":\"{s}\",\"parameters\":{s}}}",
                    .{ tool.name, tool.description, tool.input_schema_json });
            }
            try w.writeAll("]}");
        }
        try w.writeByte('}');

        const body_bytes = try body.toOwnedSlice();
        defer allocator.free(body_bytes);

        var client = std.http.Client{ .allocator = allocator };
        defer client.deinit();
        const uri = try std.Uri.parse(url);
        var hbuf: [32 * 1024]u8 = undefined;
        const headers = [_]std.http.Header{
            .{ .name = "content-type", .value = "application/json" },
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

        const full_body = try req.reader().readAllAlloc(allocator, 10 * 1024 * 1024);
        defer allocator.free(full_body);

        var iter = std.mem.splitScalar(u8, full_body, '\n');
        while (iter.next()) |line| {
            const trimmed = std.mem.trim(u8, line, " \r");
            if (!std.mem.startsWith(u8, trimmed, "data: ")) continue;
            const data = trimmed[6..];
            if (data.len == 0) continue;
            const parsed = std.json.parseFromSlice(std.json.Value, allocator, data, .{}) catch continue;
            defer parsed.deinit();
            const obj = parsed.value.object;

            if (obj.get("candidates")) |cands| {
                for (cands.array.items) |cand| {
                    const content = (cand.object.get("content") orelse continue).object;
                    const parts = (content.get("parts") orelse continue).array;
                    for (parts.items) |part| {
                        if (part.object.get("text")) |txt| {
                            try text_buf.appendSlice(txt.string);
                            if (on_chunk) |cb| cb(txt.string, ctx);
                        } else if (part.object.get("functionCall")) |fc| {
                            const fc_obj = fc.object;
                            const name = (fc_obj.get("name") orelse continue).string;
                            var arg_buf = std.ArrayList(u8).init(allocator);
                            try std.json.stringify((fc_obj.get("args") orelse std.json.Value{ .object = std.json.ObjectMap.init(allocator) }), .{}, arg_buf.writer());
                            try tool_calls.append(.{
                                .id = try std.fmt.allocPrint(allocator, "tool_{d}", .{tool_calls.items.len}),
                                .name = try allocator.dupe(u8, name),
                                .input_json = try arg_buf.toOwnedSlice(),
                            });
                        }
                    }
                }
            }
            if (obj.get("usageMetadata")) |um| {
                const uobj = um.object;
                if (uobj.get("promptTokenCount")) |it| input_tokens = @intCast(it.integer);
                if (uobj.get("candidatesTokenCount")) |ot| output_tokens = @intCast(ot.integer);
            }
        }

        return .{
            .text = try text_buf.toOwnedSlice(),
            .tool_calls = try tool_calls.toOwnedSlice(),
            .stop_reason = if (tool_calls.items.len > 0) .tool_use else .end_turn,
            .input_tokens = input_tokens,
            .output_tokens = output_tokens,
            .allocator = allocator,
        };
    }
};
