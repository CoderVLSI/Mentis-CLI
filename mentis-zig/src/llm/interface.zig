const std = @import("std");

pub const Role = enum {
    user,
    assistant,
    system,

    pub fn toString(self: Role) []const u8 {
        return @tagName(self);
    }
};

pub const ToolUse = struct {
    id: []u8,
    name: []u8,
    input_json: []u8, // raw JSON string

    pub fn deinit(self: *ToolUse, allocator: std.mem.Allocator) void {
        allocator.free(self.id);
        allocator.free(self.name);
        allocator.free(self.input_json);
    }
};

pub const ToolResult = struct {
    tool_use_id: []u8,
    content: []u8,
    is_error: bool = false,

    pub fn deinit(self: *ToolResult, allocator: std.mem.Allocator) void {
        allocator.free(self.tool_use_id);
        allocator.free(self.content);
    }
};

pub const ContentBlock = union(enum) {
    text: []u8,
    tool_use: ToolUse,
    tool_result: ToolResult,

    pub fn deinit(self: *ContentBlock, allocator: std.mem.Allocator) void {
        switch (self.*) {
            .text => |t| allocator.free(t),
            .tool_use => |*tu| tu.deinit(allocator),
            .tool_result => |*tr| tr.deinit(allocator),
        }
    }
};

pub const Message = struct {
    role: Role,
    content: []ContentBlock,

    pub fn deinit(self: *Message, allocator: std.mem.Allocator) void {
        for (self.content) |*block| block.deinit(allocator);
        allocator.free(self.content);
    }

    pub fn textOnly(allocator: std.mem.Allocator, role: Role, text: []const u8) !Message {
        const blocks = try allocator.alloc(ContentBlock, 1);
        blocks[0] = .{ .text = try allocator.dupe(u8, text) };
        return .{ .role = role, .content = blocks };
    }
};

pub const ToolDef = struct {
    name: []const u8,
    description: []const u8,
    input_schema_json: []const u8, // raw JSON schema
};

pub const ChatOptions = struct {
    model: []const u8,
    max_tokens: u32 = 8192,
    temperature: f32 = 0.7,
    system: ?[]const u8 = null,
};

pub const StopReason = enum {
    end_turn,
    tool_use,
    max_tokens,
    stop_sequence,
    other,
};

pub const ChatResult = struct {
    text: []u8,
    tool_calls: []ToolUse,
    stop_reason: StopReason,
    input_tokens: u32,
    output_tokens: u32,
    allocator: std.mem.Allocator,

    pub fn deinit(self: *ChatResult) void {
        self.allocator.free(self.text);
        for (self.tool_calls) |*tc| tc.deinit(self.allocator);
        self.allocator.free(self.tool_calls);
    }
};

pub const StreamChunkFn = *const fn (chunk: []const u8, ctx: ?*anyopaque) void;
