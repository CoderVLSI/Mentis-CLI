const std = @import("std");
const bash = @import("bash.zig");

pub fn gitStatus(allocator: std.mem.Allocator, _: []const u8) ![]u8 {
    return bash.executeBash(allocator, "{\"command\":\"git status\"}");
}

pub fn gitDiff(allocator: std.mem.Allocator, input_json: []const u8) ![]u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, input_json, .{});
    defer parsed.deinit();
    const staged = if (parsed.value.object.get("staged")) |v| v.bool else false;
    const cmd = if (staged) "git diff --staged" else "git diff";
    const wrapped = try std.fmt.allocPrint(allocator, "{{\"command\":\"{s}\"}}", .{cmd});
    defer allocator.free(wrapped);
    return bash.executeBash(allocator, wrapped);
}

pub fn gitLog(allocator: std.mem.Allocator, input_json: []const u8) ![]u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, input_json, .{});
    defer parsed.deinit();
    const n = if (parsed.value.object.get("n")) |v| @as(u32, @intCast(v.integer)) else 10;
    const cmd = try std.fmt.allocPrint(allocator, "git log --oneline -n {d}", .{n});
    defer allocator.free(cmd);
    const wrapped = try std.fmt.allocPrint(allocator, "{{\"command\":\"{s}\"}}", .{cmd});
    defer allocator.free(wrapped);
    return bash.executeBash(allocator, wrapped);
}

pub fn gitCommit(allocator: std.mem.Allocator, input_json: []const u8) ![]u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, input_json, .{});
    defer parsed.deinit();
    const message = (parsed.value.object.get("message") orelse return error.MissingMessage).string;
    const add_all = if (parsed.value.object.get("add_all")) |v| v.bool else false;

    var cmds = std.ArrayList(u8).init(allocator);
    defer cmds.deinit();
    if (add_all) try cmds.appendSlice("git add -A && ");
    try cmds.writer().print("git commit -m {s}", .{message});
    const wrapped = try std.fmt.allocPrint(allocator, "{{\"command\":\"{s}\"}}", .{cmds.items});
    defer allocator.free(wrapped);
    return bash.executeBash(allocator, wrapped);
}
