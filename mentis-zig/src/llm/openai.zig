const std = @import("std");
const config = @import("../config.zig");
const llm = @import("interface.zig");

const DEFAULT_URL = "https://api.openai.com/v1/chat/completions";

pub fn chat(
    allocator: std.mem.Allocator,
    cfg: *const config.Config,
    messages: []const llm.Message,
    opts: llm.ChatOptions,
    tool_defs: []const llm.ToolDef,
    stream_fn: llm.StreamChunkFn,
    stream_ctx: ?*anyopaque,
) !llm.ChatResult {
    const base = if (cfg.openai_base_url.len > 0) cfg.openai_base_url else DEFAULT_URL;
    const url = if (std.mem.endsWith(u8, base, "/chat/completions")) base
        else try std.fmt.allocPrint(allocator, "{s}/chat/completions", .{base});
    defer if (!std.mem.eql(u8, url, base)) allocator.free(url);

    var body = std.ArrayList(u8).init(allocator);
    defer body.deinit();
    const w = body.writer();

    try w.print("{{\"model\":\"{s}\",\"max_tokens\":{d},\"messages\":[", .{ opts.model, opts.max_tokens });

    if (opts.system.len > 0) {
        try w.writeAll("{\"role\":\"system\",\"content\":\"");
        try jsonStr(w, opts.system);
        try w.writeAll("\"}}");
        if (messages.len > 0) try w.writeByte(',');
    }

    for (messages, 0..) |msg, i| {
        if (i > 0) try w.writeByte(',');
        const role = switch (msg.role) { .user, .system => "user", .assistant => "assistant" };
        try w.print("{{\"role\":\"{s}\",\"content\":\"", .{role});
        try jsonStr(w, msg.textOnly());
        try w.writeAll("\"}}");
    }
    try w.writeByte(']');

    if (tool_defs.len > 0) {
        try w.writeAll(",\"tools\":[");
        for (tool_defs, 0..) |td, i| {
            if (i > 0) try w.writeByte(',');
            try w.print("{{\"type\":\"function\",\"function\":{{\"name\":\"{s}\",\"description\":\"", .{td.name});
            try jsonStr(w, td.description);
            try w.print("\",\"parameters\":{s}}}}}", .{td.input_schema_json});
        }
        try w.writeByte(']');
    }

    try w.writeByte('}');

    const auth = try std.fmt.allocPrint(allocator, "Bearer {s}", .{cfg.openai_api_key});
    defer allocator.free(auth);

    var client = std.http.Client{ .allocator = allocator };
    defer client.deinit();

    var resp = std.ArrayList(u8).init(allocator);
    defer resp.deinit();

    const hdrs = [_]std.http.Header{
        .{ .name = "content-type", .value = "application/json" },
        .{ .name = "authorization", .value = auth },
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
        const msg = if (e.object.get("message")) |m| m.string else "unknown";
        const t = try std.fmt.allocPrint(allocator, "OpenAI error: {s}", .{msg});
        return llm.ChatResult{ .text = t, .tool_calls = try allocator.alloc(llm.ToolUse, 0), .stop_reason = .other, .input_tokens = 0, .output_tokens = 0, .allocator = allocator };
    }

    var text_buf = std.ArrayList(u8).init(allocator);
    var calls = std.ArrayList(llm.ToolUse).init(allocator);
    var stop = llm.StopReason.end_turn;
    var in_tok: usize = 0;
    var out_tok: usize = 0;

    if (root.object.get("usage")) |u| {
        if (u.object.get("prompt_tokens")) |n| in_tok = @intCast(n.integer);
        if (u.object.get("completion_tokens")) |n| out_tok = @intCast(n.integer);
    }

    const choices = (root.object.get("choices") orelse return emptyResult(allocator)).array;
    if (choices.items.len == 0) return emptyResult(allocator);
    const choice = choices.items[0];

    if (choice.object.get("finish_reason")) |fr| {
        if (std.mem.eql(u8, fr.string, "tool_calls")) stop = .tool_use
        else if (std.mem.eql(u8, fr.string, "length")) stop = .max_tokens;
    }

    const msg = choice.object.get("message") orelse return emptyResult(allocator);

    if (msg.object.get("content")) |c| {
        if (c != .null) try text_buf.appendSlice(c.string);
    }

    if (msg.object.get("tool_calls")) |tcs| {
        for (tcs.array.items) |tc| {
            const id = try allocator.dupe(u8, (tc.object.get("id") orelse continue).string);
            const func = tc.object.get("function") orelse continue;
            const name = try allocator.dupe(u8, (func.object.get("name") orelse continue).string);
            const args = try allocator.dupe(u8, if (func.object.get("arguments")) |a| a.string else "{}");
            try calls.append(.{ .id = id, .name = name, .input_json = args });
        }
    }

    const text = try text_buf.toOwnedSlice();
    if (stream_fn) |sf| if (text.len > 0) sf(text, stream_ctx);

    return llm.ChatResult{
        .text = text,
        .tool_calls = try calls.toOwnedSlice(),
        .stop_reason = stop,
        .input_tokens = in_tok,
        .output_tokens = out_tok,
        .allocator = allocator,
    };
}

fn emptyResult(allocator: std.mem.Allocator) !llm.ChatResult {
    return llm.ChatResult{ .text = try allocator.dupe(u8, ""), .tool_calls = try allocator.alloc(llm.ToolUse, 0), .stop_reason = .end_turn, .input_tokens = 0, .output_tokens = 0, .allocator = allocator };
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
