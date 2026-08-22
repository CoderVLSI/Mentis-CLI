const std = @import("std");
const iface = @import("interface.zig");

pub const OllamaProvider = struct {
    base_url: []const u8,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator, base_url: []const u8) OllamaProvider {
        return .{ .base_url = base_url, .allocator = allocator };
    }

    pub fn chat(
        self: *OllamaProvider,
        messages: []const iface.Message,
        tools: []const iface.ToolDef,
        opts: iface.ChatOptions,
        on_chunk: ?iface.StreamChunkFn,
        ctx: ?*anyopaque,
    ) !iface.ChatResult {
        _ = tools;
        const allocator = self.allocator;
        const url = try std.fmt.allocPrint(allocator, "{s}/api/chat", .{self.base_url});
        defer allocator.free(url);

        var body = std.ArrayList(u8).init(allocator);
        defer body.deinit();
        const w = body.writer();

        try w.print("{{\"model\":\"{s}\",\"stream\":{s},\"messages\":[",
            .{ opts.model, if (on_chunk != null) "true" else "false" });

        if (opts.system) |sys| {
            try w.print("{{\"role\":\"system\",\"content\":\"{s}\"}},", .{sys});
        }

        for (messages, 0..) |msg, i| {
            if (i > 0) try w.writeByte(',');
            var text_content = std.ArrayList(u8).init(allocator);
            defer text_content.deinit();
            for (msg.content) |block| {
                switch (block) {
                    .text => |t| try text_content.appendSlice(t),
                    else => {},
                }
            }
            try w.print("{{\"role\":\"{s}\",\"content\":\"{s}\"}}",
                .{ msg.role.toString(), text_content.items });
        }
        try w.writeAll("]}");

        const body_bytes = try body.toOwnedSlice();
        defer allocator.free(body_bytes);

        var client = std.http.Client{ .allocator = allocator };
        defer client.deinit();
        const uri = try std.Uri.parse(url);
        var hbuf: [16 * 1024]u8 = undefined;
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
        var read_buf: [4096]u8 = undefined;
        var leftover = std.ArrayList(u8).init(allocator);
        defer leftover.deinit();

        while (true) {
            const n = try req.reader().read(&read_buf);
            if (n == 0) break;
            try leftover.appendSlice(read_buf[0..n]);
            while (std.mem.indexOfScalar(u8, leftover.items, '\n')) |nl| {
                const line = leftover.items[0..nl];
                const parsed = std.json.parseFromSlice(std.json.Value, allocator, line, .{}) catch {
                    const rem = leftover.items[nl + 1 ..];
                    try leftover.replaceRange(0, leftover.items.len, rem);
                    continue;
                };
                defer parsed.deinit();
                if (parsed.value.object.get("message")) |msg_val| {
                    if (msg_val.object.get("content")) |content| {
                        try text_buf.appendSlice(content.string);
                        if (on_chunk) |cb| cb(content.string, ctx);
                    }
                }
                const rem = leftover.items[nl + 1 ..];
                try leftover.replaceRange(0, leftover.items.len, rem);
            }
        }

        return .{
            .text = try text_buf.toOwnedSlice(),
            .tool_calls = try allocator.alloc(iface.ToolUse, 0),
            .stop_reason = .end_turn,
            .input_tokens = 0,
            .output_tokens = 0,
            .allocator = allocator,
        };
    }
};
