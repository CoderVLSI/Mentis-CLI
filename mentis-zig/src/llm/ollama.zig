const std = @import("std");
const config = @import("../config.zig");
const llm = @import("interface.zig");

pub fn chat(
    allocator: std.mem.Allocator,
    cfg: *const config.Config,
    messages: []const llm.Message,
    opts: llm.ChatOptions,
    stream_fn: llm.StreamChunkFn,
    stream_ctx: ?*anyopaque,
) !llm.ChatResult {
    const base = if (cfg.ollama_base_url.len > 0) cfg.ollama_base_url else "http://localhost:11434";
    const url = try std.fmt.allocPrint(allocator, "{s}/api/chat", .{base});
    defer allocator.free(url);

    var body = std.ArrayList(u8).init(allocator);
    defer body.deinit();
    const w = body.writer();

    try w.print("{{\"model\":\"{s}\",\"stream\":false,\"messages\":[", .{opts.model});
    for (messages, 0..) |msg, i| {
        if (i > 0) try w.writeByte(',');
        const role = switch (msg.role) { .user => "user", .assistant => "assistant", .system => "system" };
        try w.print("{{\"role\":\"{s}\",\"content\":\"", .{role});
        try jsonStr(w, msg.textOnly());
        try w.writeAll("\"}}");
    }
    try w.writeAll("]}");

    var client = std.http.Client{ .allocator = allocator };
    defer client.deinit();

    var resp = std.ArrayList(u8).init(allocator);
    defer resp.deinit();

    const hdrs = [_]std.http.Header{
        .{ .name = "content-type", .value = "application/json" },
    };

    _ = try client.fetch(.{
        .method = .POST,
        .location = .{ .url = url },
        .extra_headers = &hdrs,
        .payload = body.items,
        .response_storage = .{ .dynamic = &resp },
    });

    return parse(allocator, resp.items, stream_fn, stream_ctx);
}

fn parse(allocator: std.mem.Allocator, body: []const u8, stream_fn: llm.StreamChunkFn, stream_ctx: ?*anyopaque) !llm.ChatResult {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{ .ignore_unknown_fields = true });
    defer parsed.deinit();
    const root = parsed.value;

    if (root.object.get("error")) |e| {
        const t = try std.fmt.allocPrint(allocator, "Ollama error: {s}", .{e.string});
        return llm.ChatResult{ .text = t, .tool_calls = try allocator.alloc(llm.ToolUse, 0), .stop_reason = .other, .input_tokens = 0, .output_tokens = 0, .allocator = allocator };
    }

    const msg = root.object.get("message") orelse {
        return llm.ChatResult{ .text = try allocator.dupe(u8, ""), .tool_calls = try allocator.alloc(llm.ToolUse, 0), .stop_reason = .end_turn, .input_tokens = 0, .output_tokens = 0, .allocator = allocator };
    };
    const content_str = if (msg.object.get("content")) |c| c.string else "";
    const text = try allocator.dupe(u8, content_str);

    if (stream_fn) |sf| if (text.len > 0) sf(text, stream_ctx);

    return llm.ChatResult{
        .text = text,
        .tool_calls = try allocator.alloc(llm.ToolUse, 0),
        .stop_reason = .end_turn,
        .input_tokens = 0,
        .output_tokens = 0,
        .allocator = allocator,
    };
}

fn jsonStr(w: anytype, s: []const u8) !void {
    for (s) |c| switch (c) {
        '"' => try w.writeAll("\\\""),
        '\\' => try w.writeAll("\\\\"),
        '\n' => try w.writeAll("\\n"),
        '\r' => try w.writeAll("\\r"),
        '\t' => try w.writeAll("\\t"),
        0x00...0x1f => try w.print("\\u{x:0>4}", .{c}),
        else => try w.writeByte(c),
    };
}
