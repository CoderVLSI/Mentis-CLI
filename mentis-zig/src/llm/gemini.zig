const std = @import("std");
const config = @import("../config.zig");
const llm = @import("interface.zig");

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

pub fn chat(
    allocator: std.mem.Allocator,
    cfg: *const config.Config,
    messages: []const llm.Message,
    opts: llm.ChatOptions,
    tool_defs: []const llm.ToolDef,
    stream_fn: llm.StreamChunkFn,
    stream_ctx: ?*anyopaque,
) !llm.ChatResult {
    const url = try std.fmt.allocPrint(allocator, "{s}/{s}:generateContent?key={s}", .{ BASE, opts.model, cfg.gemini_api_key });
    defer allocator.free(url);

    var body = std.ArrayList(u8).init(allocator);
    defer body.deinit();
    const w = body.writer();

    try w.writeAll("{\"contents\":[");
    for (messages, 0..) |msg, i| {
        if (i > 0) try w.writeByte(',');
        if (msg.role == .system) continue;
        const role = if (msg.role == .assistant) "model" else "user";
        try w.print("{{\"role\":\"{s}\",\"parts\":[", .{role});
        for (msg.content, 0..) |blk, j| {
            if (j > 0) try w.writeByte(',');
            switch (blk) {
                .text => |t| { try w.writeAll("{\"text\":\""); try jsonStr(w, t); try w.writeAll("\"}}"); },
                .tool_use => |tu| { try w.print("{{\"functionCall\":{{\"name\":\"{s}\",\"args\":{s}}}}}", .{ tu.name, tu.input_json }); },
                .tool_result => |tr| { try w.print("{{\"functionResponse\":{{\"name\":\"tool\",\"response\":{{\"content\":\"{s}\"}}}}}}", .{tr.tool_use_id}); _ = tr; },
            }
        }
        try w.writeAll("]}");
    }
    try w.writeByte(']');

    if (opts.system.len > 0) {
        try w.writeAll(",\"systemInstruction\":{\"parts\":[{\"text\":\"");
        try jsonStr(w, opts.system);
        try w.writeAll("\"}]}");
    }

    if (tool_defs.len > 0) {
        try w.writeAll(",\"tools\":[{\"functionDeclarations\":[");
        for (tool_defs, 0..) |td, i| {
            if (i > 0) try w.writeByte(',');
            try w.print("{{\"name\":\"{s}\",\"description\":\"", .{td.name});
            try jsonStr(w, td.description);
            try w.print("\",\"parameters\":{s}}}", .{td.input_schema_json});
        }
        try w.writeAll("}]}");
    }

    try w.print(",\"generationConfig\":{{\"maxOutputTokens\":{d},\"temperature\":{d}}}}}", .{ opts.max_tokens, opts.temperature });

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
        const msg = if (e.object.get("message")) |m| m.string else "unknown";
        const t = try std.fmt.allocPrint(allocator, "Gemini error: {s}", .{msg});
        return llm.ChatResult{ .text = t, .tool_calls = try allocator.alloc(llm.ToolUse, 0), .stop_reason = .other, .input_tokens = 0, .output_tokens = 0, .allocator = allocator };
    }

    var text_buf = std.ArrayList(u8).init(allocator);
    var calls = std.ArrayList(llm.ToolUse).init(allocator);
    var stop = llm.StopReason.end_turn;
    var call_idx: usize = 0;

    const candidates = (root.object.get("candidates") orelse return emptyResult(allocator)).array;
    if (candidates.items.len == 0) return emptyResult(allocator);
    const candidate = candidates.items[0];

    if (candidate.object.get("finishReason")) |fr| {
        if (std.mem.eql(u8, fr.string, "MAX_TOKENS")) stop = .max_tokens;
    }

    const content = candidate.object.get("content") orelse return emptyResult(allocator);
    const parts = (content.object.get("parts") orelse return emptyResult(allocator)).array;

    for (parts.items) |part| {
        if (part.object.get("text")) |tv| {
            try text_buf.appendSlice(tv.string);
        } else if (part.object.get("functionCall")) |fc| {
            stop = .tool_use;
            const name = try allocator.dupe(u8, (fc.object.get("name") orelse continue).string);
            const args = if (fc.object.get("args")) |a| blk: {
                var buf = std.ArrayList(u8).init(allocator);
                try std.json.stringify(a, .{}, buf.writer());
                break :blk try buf.toOwnedSlice();
            } else try allocator.dupe(u8, "{}");
            const id = try std.fmt.allocPrint(allocator, "call_{d}", .{call_idx});
            call_idx += 1;
            try calls.append(.{ .id = id, .name = name, .input_json = args });
        }
    }

    const text = try text_buf.toOwnedSlice();
    if (stream_fn) |sf| if (text.len > 0) sf(text, stream_ctx);

    return llm.ChatResult{
        .text = text,
        .tool_calls = try calls.toOwnedSlice(),
        .stop_reason = stop,
        .input_tokens = 0,
        .output_tokens = 0,
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
