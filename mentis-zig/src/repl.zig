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
const tools_mgr = @import("tools/manager.zig");
const skills = @import("skills/manager.zig");
const commands = @import("commands/manager.zig");
const mcp = @import("mcp/client.zig");

const MAX_TOOL_ITERS = 10;

const StreamCtx = struct {
    stdout: std.fs.File,
    first: bool,
};

fn onChunk(chunk: []const u8, ctx: ?*anyopaque) void {
    const sc: *StreamCtx = @ptrCast(@alignCast(ctx.?));
    if (sc.first) {
        ui.printAssistantPrefix(sc.stdout);
        sc.first = false;
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
        if (trimmed.len > 0)
            try processInput(allocator, trimmed, cfg, &hist, &ctx, &skill_mgr, &cmd_mgr, &mcp_client, stdout);
        return;
    }

    var buf = std.ArrayList(u8).init(allocator);
    defer buf.deinit();

    while (true) {
        if (ctx.shouldCompact()) {
            ui.printWarn(stdout, "Context near limit - compacting...");
            ctx.compact();
        }
        ui.printContextBar(stdout, ctx.contextPercent());
        ui.printPrompt(stdout);

        buf.clearRetainingCapacity();
        stdin.reader().streamUntilDelimiter(buf.writer(), '\n', 1024 * 1024) catch |err| {
            if (err == error.EndOfStream) break;
            return err;
        };
        const line = std.mem.trimRight(u8, buf.items, "\r");
        if (line.len == 0) continue;
        if (std.mem.eql(u8, line, "/exit") or std.mem.eql(u8, line, "/quit") or
            std.mem.eql(u8, line, "exit") or std.mem.eql(u8, line, "quit")) break;
        if (try handleSlash(allocator, line, &hist, &skill_mgr, &cmd_mgr, stdout)) continue;
        try processInput(allocator, line, cfg, &hist, &ctx, &skill_mgr, &cmd_mgr, &mcp_client, stdout);
    }
    stdout.writeAll("\nGoodbye!\n") catch {};
}

fn handleSlash(allocator: std.mem.Allocator, line: []const u8, hist: *history.History, skill_mgr: *skills.SkillManager, cmd_mgr: *commands.CommandManager, stdout: std.fs.File) !bool {
    if (!std.mem.startsWith(u8, line, "/")) return false;
    const rest = line[1..];
    const sp = std.mem.indexOfScalar(u8, rest, ' ');
    const name = if (sp) |s| rest[0..s] else rest;
    const args = if (sp) |s| rest[s + 1 ..] else "";

    if (std.mem.eql(u8, name, "clear")) { hist.clear(); ui.printInfo(stdout, "Cleared."); return true; }
    if (std.mem.eql(u8, name, "help")) { printHelp(stdout, cmd_mgr); return true; }
    if (std.mem.eql(u8, name, "compact")) { hist.compact(); ui.printInfo(stdout, "Compacted."); return true; }
    if (std.mem.eql(u8, name, "save")) {
        hist.save(".mentis/history.json") catch |err| ui.printError(stdout, "Save failed", err);
        ui.printInfo(stdout, "Saved.");
        return true;
    }
    if (std.mem.eql(u8, name, "skills")) {
        for (skill_mgr.list()) |s| stdout.writer().print("  {s} - {s}\n", .{ s.name, s.description }) catch {};
        return true;
    }
    if (cmd_mgr.find(name)) |cmd| {
        const expanded = try cmd_mgr.expand(cmd, args);
        defer allocator.free(expanded);
        stdout.writer().print("{s}\n", .{expanded}) catch {};
        return true;
    }
    stdout.writer().print("Unknown: /{s}\n", .{name}) catch {};
    return true;
}

fn printHelp(stdout: std.fs.File, cmd_mgr: *commands.CommandManager) void {
    stdout.writeAll("  /help /clear /compact /save /skills /exit\n  @file  !cmd\n") catch {};
    for (cmd_mgr.commands.items) |c|
        stdout.writer().print("  /{s}  {s}\n", .{ c.name, c.description }) catch {};
}

fn processInput(
    allocator: std.mem.Allocator,
    raw: []const u8,
    cfg: *const config.Config,
    hist: *history.History,
    ctx: *context_mod.ContextManager,
    skill_mgr: *skills.SkillManager,
    cmd_mgr: *commands.CommandManager,
    mcp_client: *mcp.McpClient,
    stdout: std.fs.File,
) !void {
    _ = ctx;
    const input = cmd_mgr.expandFileRef(raw) catch try allocator.dupe(u8, raw);
    defer allocator.free(input);

    if (std.mem.startsWith(u8, input, "!")) {
        const out = cmd_mgr.expandBangCmd(input) catch |err| {
            ui.printError(stdout, "cmd failed", err); return;
        };
        defer allocator.free(out);
        stdout.writeAll(out) catch {};
        return;
    }

    const user_block = llm.ContentBlock{ .text = input };
    const user_blocks = [_]llm.ContentBlock{user_block};
    try hist.push(.{ .role = .user, .content = &user_blocks });

    var sys_buf = std.ArrayList(u8).init(allocator);
    defer sys_buf.deinit();
    try sys_buf.appendSlice("You are Mentis, an AI assistant for software development. Be concise and helpful.");
    try skill_mgr.systemPromptAdditions(&sys_buf);

    const tool_defs = try tools_mgr.toolDefs(allocator);
    defer allocator.free(tool_defs);
    const mcp_defs = try mcp_client.toolDefs(allocator);
    defer allocator.free(mcp_defs);
    const all_tools = try std.mem.concat(allocator, llm.ToolDef, &.{ tool_defs, mcp_defs });
    defer allocator.free(all_tools);

    const opts = llm.ChatOptions{
        .model = cfg.model,
        .max_tokens = cfg.max_tokens,
        .temperature = cfg.temperature,
        .system = sys_buf.items,
    };

    var iters: u8 = 0;
    while (iters < MAX_TOOL_ITERS) : (iters += 1) {
        var sc = StreamCtx{ .stdout = stdout, .first = true };
        const stream_fn: llm.StreamChunkFn = if (cfg.pipe_mode) null else onChunk;
        const stream_ctx: ?*anyopaque = if (cfg.pipe_mode) null else @ptrCast(&sc);

        const result = callLLM(allocator, cfg, hist, opts, all_tools, stream_fn, stream_ctx) catch |err| {
            ui.printError(stdout, "LLM error", err); return;
        };
        defer result.deinit();

        if (!sc.first) stdout.writeAll("\n") catch {};
        if (result.text.len > 0) {
            if (cfg.pipe_mode) stdout.writeAll(result.text) catch {};
            const ab = llm.ContentBlock{ .text = result.text };
            const abs = [_]llm.ContentBlock{ab};
            hist.push(.{ .role = .assistant, .content = &abs }) catch {};
        }

        if (result.tool_calls.len == 0 or result.stop_reason != .tool_use) break;

        for (result.tool_calls) |tc| {
            ui.printTool(stdout, tc.name, tc.input_json);
            const tres = if (std.mem.startsWith(u8, tc.name, "mcp__"))
                mcp_client.callTool(tc.name, tc.input_json) catch |e|
                    std.fmt.allocPrint(allocator, "MCP error: {}", .{e}) catch continue
            else
                tools_mgr.executeTool(allocator, tc.name, tc.input_json, skill_mgr) catch |e|
                    std.fmt.allocPrint(allocator, "Tool error: {}", .{e}) catch continue;
            defer allocator.free(tres);
            ui.printToolResult(stdout, tc.name, tres);
            const ta = [_]llm.ContentBlock{.{ .tool_use = tc }};
            const tr = [_]llm.ContentBlock{.{ .tool_result = .{ .tool_use_id = tc.id, .content = tres, .is_error = false } }};
            hist.push(.{ .role = .assistant, .content = &ta }) catch {};
            hist.push(.{ .role = .user, .content = &tr }) catch {};
        }
    }
}

fn callLLM(
    allocator: std.mem.Allocator,
    cfg: *const config.Config,
    hist: *history.History,
    opts: llm.ChatOptions,
    tool_defs: []const llm.ToolDef,
    stream_fn: llm.StreamChunkFn,
    stream_ctx: ?*anyopaque,
) !llm.ChatResult {
    const msgs = hist.messages.items;
    return switch (cfg.provider) {
        .anthropic => anthropic.chat(allocator, cfg, msgs, opts, tool_defs, stream_fn, stream_ctx),
        .gemini => gemini.chat(allocator, cfg, msgs, opts, tool_defs, stream_fn, stream_ctx),
        .ollama => ollama.chat(allocator, cfg, msgs, opts, stream_fn, stream_ctx),
        .openai => openai.chat(allocator, cfg, msgs, opts, tool_defs, stream_fn, stream_ctx),
    };
}
