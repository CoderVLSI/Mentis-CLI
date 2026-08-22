const std = @import("std");

pub const SkillMeta = struct {
    name: []const u8,
    description: []const u8,
    path: []const u8,
};

pub const SkillManager = struct {
    allocator: std.mem.Allocator,
    skills: std.ArrayList(SkillMeta),
    loaded: std.StringHashMap([]const u8),

    pub fn init(allocator: std.mem.Allocator) SkillManager {
        return .{
            .allocator = allocator,
            .skills = std.ArrayList(SkillMeta).init(allocator),
            .loaded = std.StringHashMap([]const u8).init(allocator),
        };
    }

    pub fn deinit(self: *SkillManager) void {
        for (self.skills.items) |s| {
            self.allocator.free(s.name);
            self.allocator.free(s.description);
            self.allocator.free(s.path);
        }
        self.skills.deinit();
        var it = self.loaded.iterator();
        while (it.next()) |entry| {
            self.allocator.free(entry.key_ptr.*);
            self.allocator.free(entry.value_ptr.*);
        }
        self.loaded.deinit();
    }

    pub fn discover(self: *SkillManager) void {
        self.discoverDir(".mentis/skills") catch {};
        const home = std.process.getEnvVarOwned(self.allocator, "HOME") catch return;
        defer self.allocator.free(home);
        var path_buf: [512]u8 = undefined;
        const global_path = std.fmt.bufPrint(&path_buf, "{s}/.mentis/skills", .{home}) catch return;
        self.discoverDir(global_path) catch {};
    }

    fn discoverDir(self: *SkillManager, dir_path: []const u8) !void {
        var dir = std.fs.cwd().openDir(dir_path, .{ .iterate = true }) catch return;
        defer dir.close();
        var it = dir.iterate();
        while (try it.next()) |entry| {
            if (!std.mem.endsWith(u8, entry.name, ".md")) continue;
            const full = try std.fmt.allocPrint(self.allocator, "{s}/{s}", .{ dir_path, entry.name });
            errdefer self.allocator.free(full);
            const name_no_ext = entry.name[0 .. entry.name.len - 3];
            const meta = try self.parseSkillMeta(full, name_no_ext);
            try self.skills.append(meta);
        }
    }

    fn parseSkillMeta(self: *SkillManager, path: []const u8, default_name: []const u8) !SkillMeta {
        const file = std.fs.cwd().openFile(path, .{}) catch {
            return SkillMeta{
                .name = try self.allocator.dupe(u8, default_name),
                .description = try self.allocator.dupe(u8, ""),
                .path = try self.allocator.dupe(u8, path),
            };
        };
        defer file.close();
        const content = try file.readToEndAlloc(self.allocator, 64 * 1024);
        defer self.allocator.free(content);

        var name = try self.allocator.dupe(u8, default_name);
        var description = try self.allocator.dupe(u8, "");

        if (std.mem.startsWith(u8, content, "---")) {
            const end = std.mem.indexOf(u8, content[3..], "---") orelse return SkillMeta{
                .name = name, .description = description, .path = try self.allocator.dupe(u8, path),
            };
            const frontmatter = content[3 .. end + 3];
            var lines = std.mem.splitScalar(u8, frontmatter, '\n');
            while (lines.next()) |line| {
                if (std.mem.startsWith(u8, line, "name:")) {
                    self.allocator.free(name);
                    name = try self.allocator.dupe(u8, std.mem.trim(u8, line[5..], " \t\r"));
                } else if (std.mem.startsWith(u8, line, "description:")) {
                    self.allocator.free(description);
                    description = try self.allocator.dupe(u8, std.mem.trim(u8, line[12..], " \t\r"));
                }
            }
        }
        return SkillMeta{ .name = name, .description = description, .path = try self.allocator.dupe(u8, path) };
    }

    pub fn list(self: *SkillManager) []const SkillMeta {
        return self.skills.items;
    }

    pub fn load(self: *SkillManager, name: []const u8) ![]const u8 {
        if (self.loaded.get(name)) |cached| return cached;
        for (self.skills.items) |s| {
            if (std.mem.eql(u8, s.name, name)) {
                const file = try std.fs.cwd().openFile(s.path, .{});
                defer file.close();
                const content = try file.readToEndAlloc(self.allocator, 1024 * 1024);
                const key = try self.allocator.dupe(u8, name);
                try self.loaded.put(key, content);
                return content;
            }
        }
        return error.SkillNotFound;
    }

    pub fn systemPromptAdditions(self: *SkillManager, buf: *std.ArrayList(u8)) !void {
        var it = self.loaded.iterator();
        while (it.next()) |entry| {
            try buf.writer().print("\n\n## Skill: {s}\n\n{s}", .{ entry.key_ptr.*, entry.value_ptr.* });
        }
    }
};
