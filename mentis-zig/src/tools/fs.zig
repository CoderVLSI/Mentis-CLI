const std = @import("std");
const llm = @import("../llm/interface.zig");

pub fn readFile(allocator: std.mem.Allocator, input_json: []const u8) ![]u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, input_json, .{});
    defer parsed.deinit();
    const path = parsed.value.object.get("path") orelse return error.MissingPath;
    const path_str = path.string;
    const offset = if (parsed.value.object.get("offset")) |v| @as(usize, @intCast(v.integer)) else 0;
    const limit = if (parsed.value.object.get("limit")) |v| @as(usize, @intCast(v.integer)) else 2000;

    const file = std.fs.cwd().openFile(path_str, .{}) catch |err| {
        return std.fmt.allocPrint(allocator, "Error opening {s}: {}", .{ path_str, err });
    };
    defer file.close();

    const content = try file.readToEndAlloc(allocator, 10 * 1024 * 1024);
    defer allocator.free(content);

    var lines = std.ArrayList([]const u8).init(allocator);
    defer lines.deinit();
    var it = std.mem.splitScalar(u8, content, '\n');
    while (it.next()) |line| try lines.append(line);

    const start = @min(offset, lines.items.len);
    const end = @min(start + limit, lines.items.len);
    const slice = lines.items[start..end];

    var out = std.ArrayList(u8).init(allocator);
    for (slice, start..) |line, i| {
        try out.writer().print("{d}\t{s}\n", .{ i + 1, line });
    }
    return out.toOwnedSlice();
}

pub fn writeFile(allocator: std.mem.Allocator, input_json: []const u8) ![]u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, input_json, .{});
    defer parsed.deinit();
    const path = (parsed.value.object.get("path") orelse return error.MissingPath).string;
    const content_val = (parsed.value.object.get("content") orelse return error.MissingContent).string;

    if (std.fs.path.dirname(path)) |dir| {
        try std.fs.cwd().makePath(dir);
    }
    const file = try std.fs.cwd().createFile(path, .{});
    defer file.close();
    try file.writeAll(content_val);
    return std.fmt.allocPrint(allocator, "Written {s} ({d} bytes)", .{ path, content_val.len });
}

pub fn editFile(allocator: std.mem.Allocator, input_json: []const u8) ![]u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, input_json, .{});
    defer parsed.deinit();
    const path = (parsed.value.object.get("path") orelse return error.MissingPath).string;
    const old_str = (parsed.value.object.get("old_string") orelse return error.MissingOldString).string;
    const new_str = (parsed.value.object.get("new_string") orelse return error.MissingNewString).string;

    const file = std.fs.cwd().openFile(path, .{}) catch |err| {
        return std.fmt.allocPrint(allocator, "Error: {}", .{err});
    };
    const content = try file.readToEndAlloc(allocator, 10 * 1024 * 1024);
    file.close();
    defer allocator.free(content);

    const count = std.mem.count(u8, content, old_str);
    if (count == 0) return std.fmt.allocPrint(allocator, "Error: old_string not found in {s}", .{path});
    if (count > 1) return std.fmt.allocPrint(allocator, "Error: old_string found {d} times, must be unique", .{count});

    const new_content = try std.mem.replaceOwned(u8, allocator, content, old_str, new_str);
    defer allocator.free(new_content);

    const out_file = try std.fs.cwd().createFile(path, .{});
    defer out_file.close();
    try out_file.writeAll(new_content);
    return std.fmt.allocPrint(allocator, "Edited {s}", .{path});
}

pub fn globFiles(allocator: std.mem.Allocator, input_json: []const u8) ![]u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, input_json, .{});
    defer parsed.deinit();
    const pattern = (parsed.value.object.get("pattern") orelse return error.MissingPattern).string;
    const search_path = if (parsed.value.object.get("path")) |v| v.string else ".";

    var results = std.ArrayList(u8).init(allocator);
    try globDir(allocator, search_path, pattern, &results);
    if (results.items.len == 0) return allocator.dupe(u8, "No files matched.");
    return results.toOwnedSlice();
}

fn globDir(allocator: std.mem.Allocator, dir_path: []const u8, pattern: []const u8, results: *std.ArrayList(u8)) !void {
    var dir = std.fs.cwd().openDir(dir_path, .{ .iterate = true }) catch return;
    defer dir.close();
    var it = dir.iterate();
    while (try it.next()) |entry| {
        var full = std.ArrayList(u8).init(allocator);
        defer full.deinit();
        try full.writer().print("{s}/{s}", .{ dir_path, entry.name });
        const full_path = full.items;
        if (entry.kind == .directory) {
            if (!std.mem.eql(u8, entry.name, ".git") and !std.mem.eql(u8, entry.name, "node_modules") and !std.mem.eql(u8, entry.name, "zig-out") and !std.mem.eql(u8, entry.name, ".zig-cache")) {
                try globDir(allocator, full_path, pattern, results);
            }
        } else {
            if (matchGlob(pattern, entry.name) or matchGlob(pattern, full_path)) {
                try results.writer().print("{s}\n", .{full_path});
            }
        }
    }
}

fn matchGlob(pattern: []const u8, name: []const u8) bool {
    if (std.mem.eql(u8, pattern, "*")) return true;
    if (std.mem.endsWith(u8, pattern, "*")) {
        const prefix = pattern[0 .. pattern.len - 1];
        return std.mem.startsWith(u8, name, prefix);
    }
    if (std.mem.startsWith(u8, pattern, "*")) {
        const suffix = pattern[1..];
        return std.mem.endsWith(u8, name, suffix);
    }
    if (std.mem.indexOf(u8, pattern, "**") != null) {
        const ext_start = std.mem.lastIndexOf(u8, pattern, ".") orelse return false;
        const ext = pattern[ext_start..];
        return std.mem.endsWith(u8, name, ext);
    }
    return std.mem.eql(u8, pattern, name);
}

pub fn grepFiles(allocator: std.mem.Allocator, input_json: []const u8) ![]u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, input_json, .{});
    defer parsed.deinit();
    const pat = (parsed.value.object.get("pattern") orelse return error.MissingPattern).string;
    const search_path = if (parsed.value.object.get("path")) |v| v.string else ".";
    const glob_filter = if (parsed.value.object.get("glob")) |v| v.string else null;

    var results = std.ArrayList(u8).init(allocator);
    try grepDir(allocator, search_path, pat, glob_filter, &results, 0);
    if (results.items.len == 0) return allocator.dupe(u8, "No matches found.");
    if (results.items.len > 50000) {
        const truncated = try std.fmt.allocPrint(allocator, "{s}\n... (truncated)", .{results.items[0..50000]});
        results.deinit();
        return truncated;
    }
    return results.toOwnedSlice();
}

fn grepDir(allocator: std.mem.Allocator, dir_path: []const u8, pattern: []const u8, glob_filter: ?[]const u8, results: *std.ArrayList(u8), depth: u8) !void {
    if (depth > 10) return;
    var dir = std.fs.cwd().openDir(dir_path, .{ .iterate = true }) catch return;
    defer dir.close();
    var it = dir.iterate();
    while (try it.next()) |entry| {
        var full = std.ArrayList(u8).init(allocator);
        defer full.deinit();
        try full.writer().print("{s}/{s}", .{ dir_path, entry.name });
        if (entry.kind == .directory) {
            if (!std.mem.eql(u8, entry.name, ".git") and !std.mem.eql(u8, entry.name, "node_modules")) {
                try grepDir(allocator, full.items, pattern, glob_filter, results, depth + 1);
            }
        } else {
            if (glob_filter) |gf| {
                if (!matchGlob(gf, entry.name)) continue;
            }
            const file = std.fs.cwd().openFile(full.items, .{}) catch continue;
            defer file.close();
            const content = file.readToEndAlloc(allocator, 5 * 1024 * 1024) catch continue;
            defer allocator.free(content);
            var line_it = std.mem.splitScalar(u8, content, '\n');
            var line_num: usize = 1;
            while (line_it.next()) |line| {
                if (std.mem.indexOf(u8, line, pattern) != null) {
                    try results.writer().print("{s}:{d}: {s}\n", .{ full.items, line_num, line });
                }
                line_num += 1;
            }
        }
    }
}
