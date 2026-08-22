const std = @import("std");
const config = @import("config.zig");
const repl = @import("repl.zig");

pub fn main() !void {
    var gpa = std.heap.DebugAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var cfg = try config.load(allocator);
    defer cfg.deinit(allocator);

    const args = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, args);

    var i: usize = 1;
    while (i < args.len) : (i += 1) {
        const arg = args[i];
        if (std.mem.eql(u8, arg, "--version") or std.mem.eql(u8, arg, "-v")) {
            try std.io.getStdOut().writeAll("mentis 1.0.0-zig\n");
            return;
        } else if (std.mem.eql(u8, arg, "--model") or std.mem.eql(u8, arg, "-m")) {
            i += 1;
            if (i < args.len) {
                allocator.free(cfg.model);
                cfg.model = try allocator.dupe(u8, args[i]);
            }
        } else if (std.mem.eql(u8, arg, "--provider")) {
            i += 1;
            if (i < args.len) {
                if (config.Provider.fromString(args[i])) |p| cfg.provider = p;
            }
        } else if (std.mem.eql(u8, arg, "--yolo")) {
            cfg.yolo = true;
        } else if (std.mem.eql(u8, arg, "--json")) {
            cfg.json_output = true;
        } else if (std.mem.eql(u8, arg, "--pipe")) {
            cfg.pipe_mode = true;
        } else if (std.mem.eql(u8, arg, "ask") or std.mem.eql(u8, arg, "-p") or std.mem.eql(u8, arg, "--prompt")) {
            i += 1;
            if (i < args.len) {
                cfg.pipe_mode = true;
                const stdin = std.io.getStdIn();
                _ = stdin;
                try repl.runOnce(allocator, &cfg, args[i]);
                return;
            }
        }
    }

    const stdin = std.io.getStdIn();
    if (!stdin.isTty()) cfg.pipe_mode = true;

    try repl.run(allocator, &cfg);
}
