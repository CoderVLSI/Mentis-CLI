const std = @import("std");
const llm = @import("../llm/interface.zig");
const fs = @import("fs.zig");
const bash = @import("bash.zig");
const git = @import("git.zig");
const skill_tool = @import("skill.zig");
const skills = @import("../skills/manager.zig");

pub const ToolFn = *const fn (allocator: std.mem.Allocator, input_json: []const u8) anyerror![]u8;

pub const Tool = struct {
    name: []const u8,
    description: []const u8,
    input_schema_json: []const u8,
};

pub const TOOLS = [_]Tool{
    .{
        .name = "Read",
        .description = "Read a file from the filesystem. Returns file content with line numbers.",
        .input_schema_json =
        \\{"type":"object","properties":{"path":{"type":"string","description":"File path to read"},"offset":{"type":"integer","description":"Line offset (0-based)"},"limit":{"type":"integer","description":"Max lines to return (default 2000)"}},"required":["path"]}
        ,
    },
    .{
        .name = "Write",
        .description = "Write content to a file, creating directories as needed.",
        .input_schema_json =
        \\{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}
        ,
    },
    .{
        .name = "Edit",
        .description = "Replace a unique string in a file with a new string.",
        .input_schema_json =
        \\{"type":"object","properties":{"path":{"type":"string"},"old_string":{"type":"string"},"new_string":{"type":"string"}},"required":["path","old_string","new_string"]}
        ,
    },
    .{
        .name = "Glob",
        .description = "Find files matching a glob pattern.",
        .input_schema_json =
        \\{"type":"object","properties":{"pattern":{"type":"string"},"path":{"type":"string","description":"Root directory (default .)"}},"required":["pattern"]}
        ,
    },
    .{
        .name = "Grep",
        .description = "Search file contents for a pattern.",
        .input_schema_json =
        \\{"type":"object","properties":{"pattern":{"type":"string"},"path":{"type":"string"},"glob":{"type":"string","description":"File glob filter"}},"required":["pattern"]}
        ,
    },
    .{
        .name = "Bash",
        .description = "Execute a bash command and return stdout+stderr.",
        .input_schema_json =
        \\{"type":"object","properties":{"command":{"type":"string"},"timeout":{"type":"integer","description":"Timeout ms (default 120000)"}},"required":["command"]}
        ,
    },
    .{
        .name = "GitStatus",
        .description = "Run git status in the current directory.",
        .input_schema_json =
        \\{"type":"object","properties":{}}
        ,
    },
    .{
        .name = "GitDiff",
        .description = "Show git diff (staged or unstaged).",
        .input_schema_json =
        \\{"type":"object","properties":{"staged":{"type":"boolean"}}}
        ,
    },
    .{
        .name = "GitLog",
        .description = "Show recent git log.",
        .input_schema_json =
        \\{"type":"object","properties":{"n":{"type":"integer","description":"Number of commits (default 10)"}}}
        ,
    },
    .{
        .name = "GitCommit",
        .description = "Create a git commit.",
        .input_schema_json =
        \\{"type":"object","properties":{"message":{"type":"string"},"add_all":{"type":"boolean"}},"required":["message"]}
        ,
    },
    .{
        .name = "LoadSkill",
        .description = "Load a skill by name from ~/.mentis/skills/ or .mentis/skills/.",
        .input_schema_json =
        \\{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}
        ,
    },
};

pub fn toolDefs(allocator: std.mem.Allocator) ![]llm.ToolDef {
    var defs = try allocator.alloc(llm.ToolDef, TOOLS.len);
    for (TOOLS, 0..) |t, i| {
        defs[i] = .{
            .name = t.name,
            .description = t.description,
            .input_schema_json = t.input_schema_json,
        };
    }
    return defs;
}

pub fn executeTool(allocator: std.mem.Allocator, name: []const u8, input_json: []const u8, skill_mgr: *skills.SkillManager) ![]u8 {
    if (std.mem.eql(u8, name, "Read")) return fs.readFile(allocator, input_json);
    if (std.mem.eql(u8, name, "Write")) return fs.writeFile(allocator, input_json);
    if (std.mem.eql(u8, name, "Edit")) return fs.editFile(allocator, input_json);
    if (std.mem.eql(u8, name, "Glob")) return fs.globFiles(allocator, input_json);
    if (std.mem.eql(u8, name, "Grep")) return fs.grepFiles(allocator, input_json);
    if (std.mem.eql(u8, name, "Bash")) return bash.executeBash(allocator, input_json);
    if (std.mem.eql(u8, name, "GitStatus")) return git.gitStatus(allocator, input_json);
    if (std.mem.eql(u8, name, "GitDiff")) return git.gitDiff(allocator, input_json);
    if (std.mem.eql(u8, name, "GitLog")) return git.gitLog(allocator, input_json);
    if (std.mem.eql(u8, name, "GitCommit")) return git.gitCommit(allocator, input_json);
    if (std.mem.eql(u8, name, "LoadSkill")) return skill_tool.loadSkill(allocator, input_json, skill_mgr);
    return std.fmt.allocPrint(allocator, "Unknown tool: {s}", .{name});
}
