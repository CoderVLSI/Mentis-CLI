const std = @import("std");

pub fn executeBash(allocator: std.mem.Allocator, input_json: []const u8) ![]u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, input_json, .{});
    defer parsed.deinit();
    const command = (parsed.value.object.get("command") orelse return error.MissingCommand).string;
    const timeout_ms = if (parsed.value.object.get("timeout")) |v| @as(u64, @intCast(v.integer)) else 120_000;
    _ = timeout_ms;

    var child = std.process.Child.init(&.{ "bash", "-c", command }, allocator);
    child.stdout_behavior = .Pipe;
    child.stderr_behavior = .Pipe;
    try child.spawn();

    const stdout = try child.stdout.?.readToEndAlloc(allocator, 10 * 1024 * 1024);
    defer allocator.free(stdout);
    const stderr = try child.stderr.?.readToEndAlloc(allocator, 1024 * 1024);
    defer allocator.free(stderr);

    const term = try child.wait();
    const exit_code: i32 = switch (term) {
        .Exited => |c| @intCast(c),
        .Signal => |s| -@as(i32, @intCast(s)),
        else => -1,
    };

    var out = std.ArrayList(u8).init(allocator);
    if (stdout.len > 0) try out.appendSlice(stdout);
    if (stderr.len > 0) {
        if (out.items.len > 0) try out.append('\n');
        try out.appendSlice(stderr);
    }
    if (exit_code != 0) {
        try out.writer().print("\n[exit code: {d}]", .{exit_code});
    }
    if (out.items.len == 0) return allocator.dupe(u8, "(no output)");
    return out.toOwnedSlice();
}
