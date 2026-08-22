const std = @import("std");

pub const Role = enum { user, assistant, system };

pub const ToolUse = struct {
    id: []u8,
    name: []u8,
    input_json: []u8,
};

pub const ToolResult = struct {
    tool_use_id: []const u8,
    content: []const u8,
    is_error: bool,
};

pub const ContentBlock = union(enum) {
    text: []const u8,
    tool_use: ToolUse,
    tool_result: ToolResult,
};

pub const Message = struct {
    role: Role,
    content: []const ContentBlock,

    pub fn textOnly(self: Message) []const u8 {
        for (self.content) |b| {
            if (b == .text) return b.text;
        }
        return "";
    }
};

pub const ToolDef = struct {
    name: []const u8,
    description: []const u8,
    input_schema_json: []const u8,
};

pub const ChatOptions = struct {
    model: []const u8,
    max_tokens: u32,
    temperature: f32,
    system: []const u8,
};

pub const StopReason = enum { end_turn, tool_use, max_tokens, stop_sequence, other };

// Optional function pointer — pass null to skip streaming output
pub const StreamChunkFn = ?*const fn (chunk: []const u8, ctx: ?*anyopaque) void;

pub const ChatResult = struct {
    text: []u8,
    tool_calls: []ToolUse,
    stop_reason: StopReason,
    input_tokens: usize,
    output_tokens: usize,
    allocator: std.mem.Allocator,

    pub fn deinit(self: *const ChatResult) void {
        self.allocator.free(self.text);
        for (self.tool_calls) |tc| {
            self.allocator.free(tc.id);
            self.allocator.free(tc.name);
            self.allocator.free(tc.input_json);
        }
        self.allocator.free(self.tool_calls);
    }
};
