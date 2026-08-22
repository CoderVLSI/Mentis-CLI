const std = @import("std");
const config = @import("config.zig");
const ui = @import("ui.zig");
const history = @import("history.zig");
const context_mod = @import("context.zig");
const llm = @import("llm/interface.zig");
const anthropic = @import("llm/anthropic.zig");
const gemini = @import("llm/gemini.zig");
const ollama = @import("llm/ollama.zig");
const openai = @import("llm/openai.zig");
const tools_manager = @import("tools/manager.zig");
const skills = @import("skills/manager.zig");
const commands = @import("commands/manager.zig");
const mcp = @import("mcp/client.zig");

const MAX_TOOL_ITERS = 10;

const StreamCtx = struct {
    stdout: std.fs.File,
    first_chunk: bool,
};

fn onChunk(chunk: []const u8, ctx: ?*anyopaque) void {
    const sc: *StreamCtx = @ptrCast(@alignCast(ctx.?));
    if (sc.first_chunk) {
        ui.printAssistantPrefix(sc.stdout);
        sc.first_chunk = false;
    }
    sc.stdout.writeAll(chunk) catch {};
}

pub fn run(allocator: std.mem.Allocator, cfg: *const config.Config) !void {
    var hist = history.History.init(allocator);
    defer hist.deinit();

    var ctx = context_mod.ContextManager.init(allocator, &hist, cfg);

    var skill_mgr = skills.SkillManager.init(allocator);
    defer skill_mgr.deinit();
    skill_mgr.discover();

    var cmd_mgr = commands.CommandManager.init(allocator);
    defer cmd_mgr.deinit();
    cmd_mgr.discover();

    var mcp_client = mcp.McpClient.init(allocator);
    defer mcp_client.deinit();
    mcp_client.loadFromConfig() catch {};

    const stdout = std.io.getStdOut();
    const stdin = std.io.getStdIn();

    if (!cfg.pipe_mode) ui.printBanner(stdout);

    if (cfg.pipe_mode) {
        const input = try stdin.readToEndAlloc(allocator, 10 * 1024 * 1024);
        defer allocator.free(input);
        const trimmed = std.mem.trim(u8, input, " \t\n\r");
        if (trimmed.len > 0) {
            try processUserInput(allocator, trimmed, cfg, &hist, &ctx, &skill_mgr, &cmd_mgr, &mcp_client, stdout);
        }
        return;
    }

    var buf = std.ArrayList(u8).init(allocator);
    defer buf.deinit();

    while (true) {
        if (ctx.shouldCompact()) {
            ui.printWarn(stdout, "Context near limit — auto-compacting...");
            ctx.compact();
            ui.printInfo(stdout, "Compacted.");
        }
        const pct = ctx.contextPercent();
        ui.printContextBar(stdout, pct);
        ui.printPrompt(stdout);

        buf.clearRetainingCapacity();
        stdin.reader().streamUntilDelimiter(buf.writer(), '\n', 1024 * 1024) catch |err| {
            if (err == error.EndOfStream) break;
            return err;
        };

        const line = std.mem.trimRight(u8, buf.items, "\r");
        if (line.len == 0) continue;

        if (std.mem.eql(u8, line, "/exit") or std.mem.eql(u8, line, "/quit") or std.mem.eql(u8, line, "exit") or std.mem.eql(u8, line, "quit")) break;

        if (try handleSlashCommand(allocator, line, &hist, &skill_mgr, &cmd_mgr, stdout)) continue;

        try processUserInput(allocator, line, cfg, &hist, &ctx, &skill_mgr, &cmd_mgr, &mcp_client, stdout);
    }

    stdout.writeAll("\nGoodbye!\n") catch {};
}

fn handleSlashCommand(allocator: std.mem.Allocator, line: []const u8, hist: *history.History, skill_mgr: *skills.SkillManager, cmd_mgr: *commands.CommandManager, stdout: std.fs.File) !bool {
    if (!std.mem.startsWith(u8, line, "/")) return false;

    const parts_raw = line[1..];
    const space = std.mem.indexOfScalar(u8, parts_raw, ' ');
    const cmd_name = if (space) |s| parts_raw[0..s] else parts_raw;
    const cmd_args = if (space) |s| parts_raw[s + 1 ..] else "";

    if (std.mem.eql(u8, cmd_name, "clear")) {
        hist.clear();
        ui.printInfo(stdout, "History cleared.");
        return true;
    }
    if (std.mem.eql(u8, cmd_name, "help")) {
        printHelp(stdout, cmd_mgr);
        return true;
    }
    if (std.mem.eql(u8, cmd_name, "skills")) {
        const skill_list = skill_mgr.list();
        if (skill_list.len == 0) {
            ui.printInfo(stdout, "No skills found.");
        } else {
            stdout.writeAll("Available skills:\n") catch {};
            for (skill_list) |s| {
                stdout.writer().print("  /{s} — {s}\n", .{ s.name, s.description }) catch {};
            }
        }
        return true;
    }
    if (std.mem.eql(u8, cmd_name, "save")) {
        hist.save(".mentis/history.json") catch |err| {
            ui.printError(stdout, "Failed to save history", err);
        };
        ui.printInfo(stdout, "History saved.");
        return true;
    }
    if (std.mem.eql(u8, cmd_name, "compact")) {
        hist.compact();
        ui.printInfo(stdout, "History compacted.");
        return true;
    }

    if (cmd_mgr.find(cmd_name)) |found_cmd| {
        const expanded = cmd_mgr.expand(found_cmd, cmd_args) catch |err| {
            ui.printError(stdout, "Command expand failed", err);
            return true;
        };
        defer allocator.free(expanded);
        stdout.writer().print("Expanding /{s}: {s}\n", .{ cmd_name, expanded }) catch {};
        return true;
    }

    stdout.writer().print("Unknown command: /{s}\n", .{cmd_name}) catch {};
    return true;
}

fn printHelp(stdout: std.fs.File, cmd_mgr: *commands.CommandManager) void {
    stdout.writeAll(
        "\nBuilt-in commands:\n" ++
        "  /help       Show this help\n" ++
        "  /clear      Clear conversation history\n" ++
        "  /skills     List available skills\n" ++
        "  /save       Save conversation history\n" ++
        "  /compact    Compact history\n" ++
        "  /exit       Exit mentis\n" ++
        "\nSpecial syntax:\n" ++
        "  @file.txt   Include file contents inline\n" ++
        "  !cmd        Run shell command and include output\n" ++
        "\nCustom commands:\n",
    ) catch {};
    for (cmd_mgr.commands.items) |c| {
        stdout.writer().print("  /{s}  {s}\n", .{ c.name, c.description }) catch {};
    }
    stdout.writeAll("\n") catch {};
}

fn processUserInput(
    allocator: std.mem.Allocator,
    raw_input: []const u8,
    cfg: *const config.Config,
    hist: *history.History,
    ctx: *context_mod.ContextManager,
    skill_mgr: *skills.SkillManager,
    cmd_mgr: *commands.CommandManager,
    mcp_client: *mcp.McpClient,
    stdout: std.fs.File,
) !void {
    _ = ctx;

    var input = cmd_mgr.expandFileRef(raw_input) catch try allocator.dupe(u8, raw_input);
    defer allocator.free(input);

    if (std.mem.startsWith(u8, input, "!")) {
        const result = cmd_mgr.expandBangCmd(input) catch |err| {
            ui.printError(stdout, "Bang command failed", err);
            return;
        };
        defer allocator.free(result);
        stdout.writeAll(result) catch {};
        return;
    }

    const user_block = llm.ContentBlock{ .text = input };
    const user_blocks = [_]llm.ContentBlock{user_block};
    try hist.push(.{ .role = .user, .content = &user_blocks });

    var system_buf = std.ArrayList(u8).init(allocator);
    defer system_buf.deinit();
    try system_buf.appendSlice("You are Mentis, an AI assistant for software development. You have access to tools to read/write files, run bash commands, and interact with git. Be concise and helpful.");
    try skill_mgr.systemPromptAdditions(&system_buf);

    var tool_defs = try tools_manager.toolDefs(allocator);
    defer allocator.free(tool_defs);

    const mcp_defs = try mcp_client.toolDefs(allocator);
    defer allocator.free(mcp_defs);

    const all_tools = try std.mem.concat(allocator, llm.ToolDef, &.{ tool_defs, mcp_defs });
    defer allocator.free(all_tools);

    const opts = llm.ChatOptions{
        .model = cfg.model,
        .max_tokens = cfg.max_tokens,
        .temperature = cfg.temperature,
        .system = system_buf.items,
    };

    var iterations: u8 = 0;
    while (iterations < MAX_TOOL_ITERS) : (iterations += 1) {
        var sc = StreamCtx{ .stdout = stdout, .first_chunk = true };
        const stream_fn: llm.StreamChunkFn = if (cfg.pipe_mode) null else onChunk;
        const stream_ctx: ?*anyopaque = if (cfg.pipe_mode) null else @ptrCast(&sc);

        const result = callLLM(allocator, cfg, hist, opts, all_tools, stream_fn, stream_ctx) catch |err| {
            ui.printError(stdout, "LLM error", err);
            return;
        };
        defer result.deinit();

        if (!sc.first_chunk) stdout.writeAll("\n") catch {};

        if (result.text.len > 0) {
            if (cfg.pipe_mode) stdout.writeAll(result.text) catch {};
            const asst_block = llm.ContentBlock{ .text = result.text };
            const asst_blocks = [_]llm.ContentBlock{asst_block};
            hist.push(.{ .role = .assistant, .content = &asst_blocks }) catch {};
        }

        if (result.tool_calls.len == 0 or result.stop_reason != .tool_use) break;

        for (result.tool_calls) |tc| {
            ui.printTool(stdout, tc.name, tc.input_json);

            const tool_result = blk: {
                if (std.mem.startsWith(u8, tc.name, "mcp__")) {
                    break :blk mcp_client.callTool(tc.name, tc.input_json) catch |err|
                        std.fmt.allocPrint(allocator, "MCP error: {}", .{err}) catch continue;
                } else {
                    break :blk tools_manager.executeTool(allocator, tc.name, tc.input_json, skill_mgr) catch |err|
                        std.fmt.allocPrint(allocator, "Tool error: {}", .{err}) catch continue;
                }
            };
            defer allocator.free(tool_result);

            ui.printToolResult(stdout, tc.name, tool_result);

            const tool_use_block = llm.ContentBlock{ .tool_use = tc };
            const tool_result_block = llm.ContentBlock{ .tool_result = .{
                .tool_use_id = tc.id,
                .content = tool_result,
                .is_error = false,
            } };
            const asst_with_tool = [_]llm.ContentBlock{tool_use_block};
            const user_with_result = [_]llm.ContentBlock{tool_result_block};
            hist.push(.{ .role = .assistant, .content = &asst_with_tool }) catch {};
            hist.push(.{ .role = .user, .content = &user_with_result }) catch {};
        }
    }
}

fn callLLM(
    allocator: std.mem.Allocator,
    cfg: *const config.Config,
    hist: *history.History,
    opts: llm.ChatOptions,
    tool_defs_slice: []const llm.ToolDef,
    stream_fn: llm.StreamChunkFn,
    stream_ctx: ?*anyopaque,
) !llm.ChatResult {
    const messages = hist.messages.items;
    return switch (cfg.provider) {
        .anthropic => anthropic.chat(allocator, cfg, messages, opts, tool_defs_slice, stream_fn, stream_ctx),
        .gemini => gemini.chat(allocator, cfg, messages, opts, tool_defs_slice, stream_fn, stream_ctx),
        .ollama => ollama.chat(allocator, cfg, messages, opts, stream_fn, stream_ctx),
        .openai => openai.chat(allocator, cfg, messages, opts, tool_defs_slice, stream_fn, stream_ctx),
    };
}
