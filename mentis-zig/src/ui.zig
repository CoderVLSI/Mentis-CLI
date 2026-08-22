const std = @import("std");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

pub fn printBanner(stdout: std.fs.File) void {
    stdout.writer().print("\n{s}mentis{s} {s}v1.0.0-zig{s}\n\n", .{ BOLD ++ CYAN, RESET, DIM, RESET }) catch {};
}

pub fn printPrompt(stdout: std.fs.File) void {
    stdout.writer().print("{s}>{s} ", .{ BOLD ++ GREEN, RESET }) catch {};
}

pub fn printAssistantPrefix(stdout: std.fs.File) void {
    stdout.writer().print("\n{s}mentis{s}: ", .{ BOLD ++ CYAN, RESET }) catch {};
}

pub fn printAssistantChunk(stdout: std.fs.File, chunk: []const u8) void {
    stdout.writeAll(chunk) catch {};
}

pub fn printTool(stdout: std.fs.File, name: []const u8, input: []const u8) void {
    stdout.writer().print("\n{s}[tool] {s}{s}\n{s}{s}{s}\n", .{
        BOLD ++ YELLOW, name, RESET, DIM, input, RESET,
    }) catch {};
}

pub fn printToolResult(stdout: std.fs.File, _: []const u8, result: []const u8) void {
    const preview = if (result.len > 500) result[0..500] else result;
    stdout.writer().print("{s}{s}{s}\n", .{ DIM, preview, RESET }) catch {};
}

pub fn printError(stdout: std.fs.File, msg: []const u8, err: anyerror) void {
    stdout.writer().print("{s}error:{s} {s}: {}\n", .{ RED, RESET, msg, err }) catch {};
}

pub fn printInfo(stdout: std.fs.File, msg: []const u8) void {
    stdout.writer().print("{s}{s}{s}\n", .{ DIM, msg, RESET }) catch {};
}

pub fn printWarn(stdout: std.fs.File, msg: []const u8) void {
    stdout.writer().print("{s}warn: {s}{s}\n", .{ YELLOW, msg, RESET }) catch {};
}

pub fn printSeparator(stdout: std.fs.File) void {
    stdout.writer().print("{s}---{s}\n", .{ DIM, RESET }) catch {};
}

pub fn printPermissionRequest(stdout: std.fs.File, tool: []const u8, input: []const u8) void {
    stdout.writer().print("{s}Allow {s}?{s}\n{s}{s}{s}\n[y/N] ", .{
        BOLD ++ YELLOW, tool, RESET, DIM, input, RESET,
    }) catch {};
}

pub fn printSkillLoaded(stdout: std.fs.File, name: []const u8) void {
    stdout.writer().print("{s}skill loaded: {s}{s}\n", .{ GREEN, name, RESET }) catch {};
}

pub fn printContextBar(stdout: std.fs.File, pct: u8) void {
    const filled: usize = @min(@as(usize, pct) * 40 / 100, 40);
    const w = stdout.writer();
    w.print("{s}[", .{DIM}) catch return;
    var i: usize = 0;
    while (i < 40) : (i += 1) {
        if (i < filled) w.writeAll("=") catch return
        else w.writeAll(" ") catch return;
    }
    w.print("] {d}%{s}\n", .{ pct, RESET }) catch {};
}

pub fn printUser(_: std.fs.File) void {}
