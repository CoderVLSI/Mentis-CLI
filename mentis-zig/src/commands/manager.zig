const std = @import("std");

pub const Command = struct {
    name: []const u8,
    description: []const u8,
    template: []const u8,
    path: []const u8,
};

pub const CommandManager = struct {
    allocator: std.mem.Allocator,
    commands: std.ArrayList(Command),

    pub fn init(allocator: std.mem.Allocator) CommandManager {
        return .{ .allocator = allocator, .commands = std.ArrayList(Command).init(allocator) };
    }

    pub fn deinit(self: *CommandManager) void {
        for (self.commands.items) |c| {
            self.allocator.free(c.name);
            self.allocator.free(c.description);
            self.allocator.free(c.template);
            self.allocator.free(c.path);
        }
        self.commands.deinit();
    }

    pub fn discover(self: *CommandManager) void {
        self.discoverDir(".mentis/commands") catch {};
        const home = std.process.getEnvVarOwned(self.allocator, "HOME") catch return;
        defer self.allocator.free(home);
        var buf: [512]u8 = undefined;
        const global = std.fmt.bufPrint(&buf, "{s}/.mentis/commands", .{home}) catch return;
        self.discoverDir(global) catch {};
    }

    fn discoverDir(self: *CommandManager, dir_path: []const u8) !void {
        var dir = std.fs.cwd().openDir(dir_path, .{ .iterate = true }) catch return;
        defer dir.close();
        var it = dir.iterate();
        while (try it.next()) |entry| {
            if (!std.mem.endsWith(u8, entry.name, ".md")) continue;
            const full = try std.fmt.allocPrint(self.allocator, "{s}/{s}", .{ dir_path, entry.name });
            errdefer self.allocator.free(full);
            const name_no_ext = try self.allocator.dupe(u8, entry.name[0 .. entry.name.len - 3]);
            errdefer self.allocator.free(name_no_ext);
            const cmd = try self.loadCommand(full, name_no_ext);
            try self.commands.append(cmd);
        }
    }

    fn loadCommand(self: *CommandManager, path: []const u8, name: []const u8) !Command {
        const file = std.fs.cwd().openFile(path, .{}) catch {
            return Command{ .name = name, .description = try self.allocator.dupe(u8, ""), .template = try self.allocator.dupe(u8, ""), .path = try self.allocator.dupe(u8, path) };
        };
        defer file.close();
        const content = try file.readToEndAlloc(self.allocator, 256 * 1024);
        errdefer self.allocator.free(content);

        var description = try self.allocator.dupe(u8, "");
        var template_start: usize = 0;

        if (std.mem.startsWith(u8, content, "---")) {
            if (std.mem.indexOf(u8, content[3..], "---")) |end| {
                const fm = content[3 .. end + 3];
                var lines = std.mem.splitScalar(u8, fm, '\n');
                while (lines.next()) |line| {
                    if (std.mem.startsWith(u8, line, "description:")) {
                        self.allocator.free(description);
                        description = try self.allocator.dupe(u8, std.mem.trim(u8, line[12..], " \t\r"));
                    }
                }
                template_start = end + 6;
            }
        }

        const template = try self.allocator.dupe(u8, if (template_start < content.len) content[template_start..] else content);
        self.allocator.free(content);
        return Command{ .name = name, .description = description, .template = template, .path = try self.allocator.dupe(u8, path) };
    }

    pub fn find(self: *CommandManager, name: []const u8) ?*const Command {
        for (self.commands.items) |*c| {
            if (std.mem.eql(u8, c.name, name)) return c;
        }
        return null;
    }

    pub fn expand(self: *CommandManager, cmd: *const Command, args: []const u8) ![]u8 {
        var result = try self.allocator.dupe(u8, cmd.template);
        result = try replaceAll(self.allocator, result, "$ARGUMENTS", args);

        var parts = std.mem.splitScalar(u8, args, ' ');
        var i: u8 = 1;
        while (parts.next()) |part| {
            var placeholder: [4]u8 = undefined;
            const ph = try std.fmt.bufPrint(&placeholder, "${d}", .{i});
            const new_result = try replaceAll(self.allocator, result, ph, part);
            self.allocator.free(result);
            result = new_result;
            i += 1;
        }
        return result;
    }

    pub fn expandFileRef(self: *CommandManager, text: []const u8) ![]u8 {
        var out = std.ArrayList(u8).init(self.allocator);
        var remaining = text;
        while (std.mem.indexOf(u8, remaining, "@")) |at| {
            try out.appendSlice(remaining[0..at]);
            const rest = remaining[at + 1 ..];
            const end = std.mem.indexOfAny(u8, rest, " \t\n") orelse rest.len;
            const file_path = rest[0..end];
            const file_content = blk: {
                const f = std.fs.cwd().openFile(file_path, .{}) catch break :blk null;
                defer f.close();
                break :blk f.readToEndAlloc(self.allocator, 1024 * 1024) catch null;
            };
            if (file_content) |fc| {
                defer self.allocator.free(fc);
                try out.writer().print("```\n{s}\n```", .{fc});
            } else {
                try out.writer().print("@{s}", .{file_path});
            }
            remaining = rest[end..];
        }
        try out.appendSlice(remaining);
        return out.toOwnedSlice();
    }

    pub fn expandBangCmd(self: *CommandManager, text: []const u8) ![]u8 {
        if (!std.mem.startsWith(u8, text, "!")) return self.allocator.dupe(u8, text);
        const cmd = text[1..];
        var child = std.process.Child.init(&.{ "bash", "-c", cmd }, self.allocator);
        child.stdout_behavior = .Pipe;
        child.stderr_behavior = .Pipe;
        try child.spawn();
        const stdout = try child.stdout.?.readToEndAlloc(self.allocator, 1024 * 1024);
        _ = try child.wait();
        return stdout;
    }
};

fn replaceAll(allocator: std.mem.Allocator, src: []u8, needle: []const u8, replacement: []const u8) ![]u8 {
    const result = try std.mem.replaceOwned(u8, allocator, src, needle, replacement);
    allocator.free(src);
    return result;
}
