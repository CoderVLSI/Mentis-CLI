const std = @import("std");
const llm = @import("llm/interface.zig");

pub const History = struct {
    messages: std.ArrayList(llm.Message),
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) History {
        return .{
            .messages = std.ArrayList(llm.Message).init(allocator),
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *History) void {
        for (self.messages.items) |*msg| msg.deinit(self.allocator);
        self.messages.deinit();
    }

    pub fn push(self: *History, msg: llm.Message) !void {
        try self.messages.append(msg);
    }

    pub fn clear(self: *History) void {
        for (self.messages.items) |*msg| msg.deinit(self.allocator);
        self.messages.clearRetainingCapacity();
    }

    pub fn estimateTokens(self: *const History) u32 {
        var total: u32 = 0;
        for (self.messages.items) |msg| {
            for (msg.content) |block| {
                switch (block) {
                    .text => |t| total += @intCast(t.len / 4),
                    .tool_use => |tu| total += @intCast(tu.input_json.len / 4 + tu.name.len),
                    .tool_result => |tr| total += @intCast(tr.content.len / 4),
                }
            }
        }
        return total;
    }

    // Compact: drop old messages, keep recent half
    pub fn compact(self: *History, system_prompt: []const u8) !void {
        _ = system_prompt;
        const len = self.messages.items.len;
        if (len < 4) return;
        const keep_from = len / 2;
        // Free dropped messages
        for (self.messages.items[0..keep_from]) |*msg| msg.deinit(self.allocator);
        // Shift remaining
        const remaining = len - keep_from;
        for (0..remaining) |j| {
            self.messages.items[j] = self.messages.items[j + keep_from];
        }
        self.messages.shrinkRetainingCapacity(remaining);
    }

    pub fn save(self: *const History, path: []const u8) !void {
        const file = try std.fs.cwd().createFile(path, .{});
        defer file.close();
        var writer = file.writer();
        try writer.writeAll("[\n");
        for (self.messages.items, 0..) |msg, idx| {
            try writer.print("  {{\"role\":\"{s}\",\"content\":", .{@tagName(msg.role)});
            try writer.writeAll("[");
            for (msg.content, 0..) |block, bi| {
                switch (block) {
                    .text => |t| try writer.print("{{\"type\":\"text\",\"text\":{s}}}", .{try jsonEscape(self.allocator, t)}),
                    .tool_use => |tu| try writer.print("{{\"type\":\"tool_use\",\"id\":\"{s}\",\"name\":\"{s}\",\"input\":{s}}}", .{ tu.id, tu.name, tu.input_json }),
                    .tool_result => |tr| try writer.print("{{\"type\":\"tool_result\",\"tool_use_id\":\"{s}\",\"content\":{s}}}", .{ tr.tool_use_id, try jsonEscape(self.allocator, tr.content) }),
                }
                if (bi < msg.content.len - 1) try writer.writeAll(",");
            }
            try writer.writeAll("]}");
            if (idx < self.messages.items.len - 1) try writer.writeAll(",");
            try writer.writeAll("\n");
        }
        try writer.writeAll("]\n");
    }
};

fn jsonEscape(allocator: std.mem.Allocator, s: []const u8) ![]u8 {
    var out = std.ArrayList(u8).init(allocator);
    defer out.deinit();
    try out.append('"');
    for (s) |ch| {
        switch (ch) {
            '"' => try out.appendSlice("\\\""),
            '\\' => try out.appendSlice("\\\\"),
            '\n' => try out.appendSlice("\\n"),
            '\r' => try out.appendSlice("\\r"),
            '\t' => try out.appendSlice("\\t"),
            else => try out.append(ch),
        }
    }
    try out.append('"');
    return out.toOwnedSlice();
}
