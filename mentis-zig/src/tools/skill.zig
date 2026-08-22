const std = @import("std");
const skills = @import("../skills/manager.zig");

pub fn loadSkill(allocator: std.mem.Allocator, input_json: []const u8, skill_mgr: *skills.SkillManager) ![]u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, input_json, .{});
    defer parsed.deinit();
    const name = (parsed.value.object.get("name") orelse return error.MissingName).string;

    const content = skill_mgr.load(name) catch |err| {
        return std.fmt.allocPrint(allocator, "Error loading skill '{s}': {}", .{ name, err });
    };
    return std.fmt.allocPrint(allocator, "Skill '{s}' loaded ({d} chars)", .{ name, content.len });
}
