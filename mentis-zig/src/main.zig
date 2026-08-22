const std = @import("std");
const config = @import("config.zig");
const repl = @import("repl.zig");
const ui = @import("ui.zig");

const VERSION = "1.0.0";

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const args = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, args);

    var cfg = try config.load(allocator);
    defer cfg.deinit(allocator);

    var model_override: ?[]const u8 = null;
    var yolo = false;
    var one_shot: ?[]const u8 = null;
    var json_output = false;
    var print_version = false;
    var pipe_mode = false;

    var i: usize = 1;
    while (i < args.len) : (i += 1) {
        const arg = args[i];
        if (std.mem.eql(u8, arg, "--version") or std.mem.eql(u8, arg, "-v")) {
            print_version = true;
        } else if (std.mem.eql(u8, arg, "--model") or std.mem.eql(u8, arg, "-m")) {
            i += 1;
            if (i < args.len) model_override = args[i];
        } else if (std.mem.eql(u8, arg, "--yolo")) {
            yolo = true;
        } else if (std.mem.eql(u8, arg, "--json")) {
            json_output = true;
        } else if (std.mem.eql(u8, arg, "--pipe")) {
            pipe_mode = true;
        } else if (std.mem.eql(u8, arg, "ask") or std.mem.eql(u8, arg, "-p") or std.mem.eql(u8, arg, "--prompt")) {
            i += 1;
            if (i < args.len) one_shot = args[i];
        } else if (!std.mem.startsWith(u8, arg, "-") and one_shot == null) {
            one_shot = arg;
        }
    }

    if (print_version) {
        try std.io.getStdOut().writer().print("mentis {s}\n", .{VERSION});
        return;
    }

    if (model_override) |m| {
        allocator.free(cfg.model);
        cfg.model = try allocator.dupe(u8, m);
    }
    cfg.yolo = yolo;
    cfg.pipe_mode = pipe_mode;
    cfg.json_output = json_output;

    // Check if stdin is piped
    const stdin_stat = std.io.getStdIn().stat() catch null;
    if (stdin_stat) |s| {
        if (s.kind != .tty and one_shot == null) {
            // Read from stdin as prompt
            const stdin_data = try std.io.getStdIn().reader().readAllAlloc(allocator, 1024 * 1024);
            defer allocator.free(stdin_data);
            const trimmed = std.mem.trim(u8, stdin_data, "\n\r ");
            if (trimmed.len > 0) {
                one_shot = try allocator.dupe(u8, trimmed);
            }
        }
    }

    try repl.run(allocator, &cfg, one_shot, json_output);
}
