const std = @import("std");
const config = @import("../config.zig");
const llm = @import("interface.zig");

const URL = "https://api.anthropic.com/v1/messages";

pub fn chat(
    allocator: std.mem.Allocator,
    cfg: *const config.Config,
    messages: []const llm.Message,
    opts: llm.ChatOptions,
    tool_defs: []const llm.ToolDef,
    stream_fn: llm.StreamChunkFn,
    stream_ctx: ?*anyopaque,
) !llm.ChatResult {
    var body = std.ArrayList(u8).init(allocator);
    defer body.deinit();
    const w = body.writer();

    try w.print("{{\"model\":\"{s}\",\"max_tokens\":{d}", .{ opts.model, opts.max_tokens });

    if (opts.system.len > 0) {
        try w.writeAll(",\"system\":\"");
        try jsonStr(w, opts.system);
        try w.writeByte('"');
    }

    try w.writeAll(",\"messages\":");
    try writeMessages(w, messages);

    if (tool_defs.len > 0) {
        try w.writeAll(",\"tools\":");
        try writeTools(w, tool_defs);
    }

    try w.writeByte('}');

    var client = std.http.Client{ .allocator = allocator };
    defer client.deinit();

    var resp = std.ArrayList(u8).init(allocator);
    defer resp.deinit();

    const hdrs = [_]std.http.Header{
        .{ .name = "content-type", .value = "application/json" },
        .{ .name = "x-api-key", .value = cfg.anthropic_api_key },
        .{ .name = "anthropic-version", .value = "2023-06-01" },
    };

    _ = try client.fetch(.{
        .method = .POST,
        .location = .{ .url = URL },
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
        const t = try std.fmt.allocPrint(allocator, "API error: {s}", .{msg});
        return llm.ChatResult{ .text = t, .tool_calls = try allocator.alloc(llm.ToolUse, 0), .stop_reason = .other, .input_tokens = 0, .output_tokens = 0, .allocator = allocator };
    }

    var text_buf = std.ArrayList(u8).init(allocator);
    var calls = std.ArrayList(llm.ToolUse).init(allocator);
    var stop = llm.StopReason.end_turn;
    var in_tok: usize = 0;
    var out_tok: usize = 0;

    if (root.object.get("stop_reason")) |sr| {
        if (std.mem.eql(u8, sr.string, "tool_use")) stop = .tool_use
        else if (std.mem.eql(u8, sr.string, "max_tokens")) stop = .max_tokens;
    }
    if (root.object.get("usage")) |u| {
        if (u.object.get("input_tokens")) |n| in_tok = @intCast(n.integer);
        if (u.object.get("output_tokens")) |n| out_tok = @intCast(n.integer);
    }
    if (root.object.get("content")) |content| {
        for (content.array.items) |blk| {
            const t = (blk.object.get("type") orelse continue).string;
            if (std.mem.eql(u8, t, "text")) {
                if (blk.object.get("text")) |tv| try text_buf.appendSlice(tv.string);
            } else if (std.mem.eql(u8, t, "tool_use")) {
                const id = try allocator.dupe(u8, (blk.object.get("id") orelse continue).string);
                const name = try allocator.dupe(u8, (blk.object.get("name") orelse continue).string);
                const input = if (blk.object.get("input")) |iv| blk2: {
                    var buf = std.ArrayList(u8).init(allocator);
                    try std.json.stringify(iv, .{}, buf.writer());
                    break :blk2 try buf.toOwnedSlice();
                } else try allocator.dupe(u8, "{}");
                try calls.append(.{ .id = id, .name = name, .input_json = input });
            }
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

fn writeMessages(w: anytype, messages: []const llm.Message) !void {
    try w.writeByte('[');
    for (messages, 0..) |msg, i| {
        if (i > 0) try w.writeByte(',');
        const role = switch (msg.role) { .user, .system => "user", .assistant => "assistant" };
        try w.print("{{\"role\":\"{s}\",\"content\":[", .{role});
        for (msg.content, 0..) |blk, j| {
            if (j > 0) try w.writeByte(',');
            switch (blk) {
                .text => |t| { try w.writeAll("{\"type\":\"text\",\"text\":\""); try jsonStr(w, t); try w.writeAll("\"}}"); },
                .tool_use => |tu| { try w.print("{{\"type\":\"tool_use\",\"id\":\"{s}\",\"name\":\"{s}\",\"input\":{s}}}", .{ tu.id, tu.name, tu.input_json }); },
                .tool_result => |tr| { try w.print("{{\"type\":\"tool_result\",\"tool_use_id\":\"{s}\",\"content\":\"", .{tr.tool_use_id}); try jsonStr(w, tr.content); try w.writeAll("\"}}"); },
            }
        }
        try w.writeAll("]}");
    }
    try w.writeByte(']');
}

fn writeTools(w: anytype, tools: []const llm.ToolDef) !void {
    try w.writeByte('[');
    for (tools, 0..) |td, i| {
        if (i > 0) try w.writeByte(',');
        try w.print("{{\"name\":\"{s}\",\"description\":\"", .{td.name});
        try jsonStr(w, td.description);
        try w.print("\",\"input_schema\":{s}}}", .{td.input_schema_json});
    }
    try w.writeByte(']');
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
