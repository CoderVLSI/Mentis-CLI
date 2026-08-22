const std = @import("std");
const history = @import("history.zig");
const config = @import("config.zig");

pub const ContextManager = struct {
    allocator: std.mem.Allocator,
    hist: *history.History,
    cfg: *const config.Config,

    pub fn init(allocator: std.mem.Allocator, hist: *history.History, cfg: *const config.Config) ContextManager {
        return .{ .allocator = allocator, .hist = hist, .cfg = cfg };
    }

    pub fn estimateTokens(self: *ContextManager) usize {
        return self.hist.estimateTokens();
    }

    pub fn shouldCompact(self: *ContextManager) bool {
        const model_limit = modelContextLimit(self.cfg.model);
        const used = self.estimateTokens();
        const threshold = (model_limit * self.cfg.auto_compact_threshold) / 100;
        return used >= threshold;
    }

    pub fn compact(self: *ContextManager) void {
        self.hist.compact();
    }

    pub fn contextPercent(self: *ContextManager) u8 {
        const limit = modelContextLimit(self.cfg.model);
        const used = self.estimateTokens();
        if (limit == 0) return 0;
        const pct = (used * 100) / limit;
        return @intCast(@min(pct, 100));
    }
};

fn modelContextLimit(model: []const u8) usize {
    if (std.mem.indexOf(u8, model, "claude-3-5") != null) return 200000;
    if (std.mem.indexOf(u8, model, "claude-3") != null) return 200000;
    if (std.mem.indexOf(u8, model, "claude-sonnet") != null) return 200000;
    if (std.mem.indexOf(u8, model, "claude-opus") != null) return 200000;
    if (std.mem.indexOf(u8, model, "gemini-1.5-pro") != null) return 1000000;
    if (std.mem.indexOf(u8, model, "gemini-1.5-flash") != null) return 1000000;
    if (std.mem.indexOf(u8, model, "gemini-2") != null) return 1000000;
    if (std.mem.indexOf(u8, model, "gpt-4o") != null) return 128000;
    if (std.mem.indexOf(u8, model, "gpt-4") != null) return 128000;
    return 128000;
}
