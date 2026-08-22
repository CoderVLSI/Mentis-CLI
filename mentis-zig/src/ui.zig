const std = @import("std");

const stdout = std.io.getStdOut();
const stderr = std.io.getStdErr();

// ANSI colors
pub const reset  = "\x1b[0m";
pub const bold   = "\x1b[1m";
pub const dim    = "\x1b[2m";
pub const green  = "\x1b[32m";
pub const blue   = "\x1b[34m";
pub const cyan   = "\x1b[36m";
pub const yellow = "\x1b[33m";
pub const red    = "\x1b[31m";
pub const purple = "\x1b[35m";
pub const gray   = "\x1b[90m";
pub const white  = "\x1b[97m";

var use_color: bool = true;

pub fn initColor() void {
    // Disable color if not a tty or NO_COLOR is set
    if (std.process.getEnvVarOwned(std.heap.page_allocator, "NO_COLOR") catch null) |_| {
        use_color = false;
    }
}

fn c(code: []const u8) []const u8 {
    return if (use_color) code else "";
}

pub fn printUser(allocator: std.mem.Allocator, text: []const u8) void {
    _ = allocator;
    stdout.writer().print("{s}{s}You{s} {s}\n", .{ c(bold), c(blue), c(reset), text }) catch {};
}

pub fn printAssistantChunk(chunk: []const u8) void {
    stdout.writer().writeAll(chunk) catch {};
}

pub fn printAssistantDone() void {
    stdout.writer().writeByte('\n') catch {};
}

pub fn printAssistantPrefix() void {
    stdout.writer().print("{s}{s}Mentis{s} ", .{ c(bold), c(cyan), c(reset) }) catch {};
}

pub fn printTool(name: []const u8, input_preview: []const u8) void {
    stdout.writer().print("{s}⧗ {s}{s}{s} {s}{s}{s}\n",
        .{ c(yellow), c(bold), name, c(reset), c(gray), input_preview, c(reset) }) catch {};
}

pub fn printToolResult(result: []const u8) void {
    // Show first 200 chars of result
    const preview = if (result.len > 200) result[0..200] else result;
    stdout.writer().print("{s}  → {s}{s}\n", .{ c(gray), preview, c(reset) }) catch {};
}

pub fn printError(msg: []const u8) void {
    stderr.writer().print("{s}{s}Error:{s} {s}\n", .{ c(bold), c(red), c(reset), msg }) catch {};
}

pub fn printInfo(msg: []const u8) void {
    stdout.writer().print("{s}{s}\n", .{ c(gray), msg, }) catch {};
    stdout.writer().writeAll(reset) catch {};
}

pub fn printWarn(msg: []const u8) void {
    stdout.writer().print("{s}{s}⚠  {s}{s}\n", .{ c(yellow), c(bold), c(reset), msg }) catch {};
}

pub fn printBanner() void {
    stdout.writer().print(
        "{s}{s}■ Mentis{s}  {s}AI coding agent  {s}type /help for commands{s}\n",
        .{ c(bold), c(cyan), c(reset), c(white), c(gray), c(reset) },
    ) catch {};
}

pub fn printPrompt() void {
    stdout.writer().print("{s}>{s} ", .{ c(green), c(reset) }) catch {};
    stdout.writer().context.flush() catch {};
}

pub fn printContextBar(used: u32, total: u32) void {
    const pct = @as(f32, @floatFromInt(used)) / @as(f32, @floatFromInt(total)) * 100.0;
    const color = if (pct > 80.0) c(red) else if (pct > 60.0) c(yellow) else c(gray);
    stdout.writer().print("{s}  ctx {d}/{d} ({d:.0}%){s}\n",
        .{ color, used, total, pct, c(reset) }) catch {};
}

pub fn printPermissionRequest(tool: []const u8, preview: []const u8) !bool {
    stdout.writer().print(
        "{s}{s}⚠  Allow tool:{s} {s}{s}{s}\n  {s}{s}{s}\n  [y/n] ",
        .{ c(bold), c(yellow), c(reset), c(bold), tool, c(reset), c(gray), preview, c(reset) },
    ) catch {};
    stdout.writer().context.flush() catch {};
    var buf: [8]u8 = undefined;
    const n = std.io.getStdIn().reader().read(&buf) catch return false;
    const answer = std.mem.trim(u8, buf[0..n], "\n\r ");
    return std.mem.eql(u8, answer, "y") or std.mem.eql(u8, answer, "yes");
}

pub fn clearLine() void {
    stdout.writer().writeAll("\r\x1b[2K") catch {};
}

pub fn printSkillLoaded(name: []const u8) void {
    stdout.writer().print("{s}○ skill:{s} {s}\n", .{ c(purple), c(reset), name }) catch {};
}

pub fn printSeparator() void {
    stdout.writer().print("{s}{s}{s}\n", .{ c(dim), "─" ** 40, c(reset) }) catch {};
}
