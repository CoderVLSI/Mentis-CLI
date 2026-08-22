const std = @import("std");
const llm = @import("../llm/interface.zig");

pub const McpTool = struct {
    name: []const u8,
    description: []const u8,
    input_schema_json: []const u8,
    server_name: []const u8,
};

pub const McpServerConfig = struct {
    name: []const u8,
    command: []const u8,
    args: []const []const u8,
    env: ?std.StringHashMap([]const u8),
};

pub const McpClient = struct {
    allocator: std.mem.Allocator,
    tools: std.ArrayList(McpTool),
    servers: std.ArrayList(McpServerConfig),
    processes: std.ArrayList(std.process.Child),
    next_id: u64,

    pub fn init(allocator: std.mem.Allocator) McpClient {
        return .{
            .allocator = allocator,
            .tools = std.ArrayList(McpTool).init(allocator),
            .servers = std.ArrayList(McpServerConfig).init(allocator),
            .processes = std.ArrayList(std.process.Child).init(allocator),
            .next_id = 1,
        };
    }

    pub fn deinit(self: *McpClient) void {
        for (self.tools.items) |t| {
            self.allocator.free(t.name);
            self.allocator.free(t.description);
            self.allocator.free(t.input_schema_json);
            self.allocator.free(t.server_name);
        }
        self.tools.deinit();
        self.servers.deinit();
        for (self.processes.items) |*proc| {
            _ = proc.kill() catch {};
        }
        self.processes.deinit();
    }

    pub fn loadFromConfig(self: *McpClient) !void {
        const config_json = self.readMcpConfig() catch return;
        defer self.allocator.free(config_json);
        const parsed = std.json.parseFromSlice(std.json.Value, self.allocator, config_json, .{}) catch return;
        defer parsed.deinit();
        const servers_val = parsed.value.object.get("mcpServers") orelse return;
        var it = servers_val.object.iterator();
        while (it.next()) |entry| {
            const server_name = entry.key_ptr.*;
            const server_obj = entry.value_ptr.*;
            const cmd = (server_obj.object.get("command") orelse continue).string;
            try self.connectServer(server_name, cmd, server_obj);
        }
    }

    fn readMcpConfig(self: *McpClient) ![]u8 {
        const local_file = std.fs.cwd().openFile(".mentis/mcp.json", .{}) catch null;
        if (local_file) |f| {
            defer f.close();
            return f.readToEndAlloc(self.allocator, 1024 * 1024);
        }
        const home = try std.process.getEnvVarOwned(self.allocator, "HOME");
        defer self.allocator.free(home);
        var buf: [512]u8 = undefined;
        const global = try std.fmt.bufPrint(&buf, "{s}/.mentis/mcp.json", .{home});
        const gf = try std.fs.cwd().openFile(global, .{});
        defer gf.close();
        return gf.readToEndAlloc(self.allocator, 1024 * 1024);
    }

    fn connectServer(self: *McpClient, name: []const u8, command: []const u8, _: std.json.Value) !void {
        var child = std.process.Child.init(&.{ command }, self.allocator);
        child.stdin_behavior = .Pipe;
        child.stdout_behavior = .Pipe;
        child.stderr_behavior = .Ignore;
        child.spawn() catch return;

        const init_req = try std.fmt.allocPrint(self.allocator,
            "{{\"jsonrpc\":\"2.0\",\"id\":{d},\"method\":\"initialize\",\"params\":{{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{{}},\"clientInfo\":{{\"name\":\"mentis\",\"version\":\"1.0\"}}}}}}",
            .{self.next_id});
        self.next_id += 1;
        defer self.allocator.free(init_req);

        const stdin = child.stdin orelse return;
        stdin.writer().print("{s}\n", .{init_req}) catch return;

        var resp_buf: [16384]u8 = undefined;
        const n = child.stdout.?.read(&resp_buf) catch return;
        if (n == 0) return;

        const notify = try std.fmt.allocPrint(self.allocator,
            "{{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\",\"params\":{{}}}}",
            .{});
        defer self.allocator.free(notify);
        stdin.writer().print("{s}\n", .{notify}) catch {};

        const list_req = try std.fmt.allocPrint(self.allocator,
            "{{\"jsonrpc\":\"2.0\",\"id\":{d},\"method\":\"tools/list\",\"params\":{{}}}}",
            .{self.next_id});
        self.next_id += 1;
        defer self.allocator.free(list_req);
        stdin.writer().print("{s}\n", .{list_req}) catch return;

        const n2 = child.stdout.?.read(&resp_buf) catch return;
        if (n2 == 0) return;
        const resp_slice = resp_buf[0..n2];

        const resp_parsed = std.json.parseFromSlice(std.json.Value, self.allocator, resp_slice, .{}) catch return;
        defer resp_parsed.deinit();

        const result = resp_parsed.value.object.get("result") orelse return;
        const tools_arr = (result.object.get("tools") orelse return).array;
        for (tools_arr.items) |tool_val| {
            const t_name = (tool_val.object.get("name") orelse continue).string;
            const t_desc = if (tool_val.object.get("description")) |d| d.string else "";
            const schema = tool_val.object.get("inputSchema") orelse std.json.Value{ .object = std.json.ObjectMap.init(self.allocator) };
            var schema_buf = std.ArrayList(u8).init(self.allocator);
            try std.json.stringify(schema, .{}, schema_buf.writer());
            try self.tools.append(.{
                .name = try std.fmt.allocPrint(self.allocator, "mcp__{s}__{s}", .{ name, t_name }),
                .description = try self.allocator.dupe(u8, t_desc),
                .input_schema_json = try schema_buf.toOwnedSlice(),
                .server_name = try self.allocator.dupe(u8, name),
            });
        }
        try self.processes.append(child);
    }

    pub fn callTool(self: *McpClient, tool_name: []const u8, input_json: []const u8) ![]u8 {
        const prefix = "mcp__";
        if (!std.mem.startsWith(u8, tool_name, prefix)) return error.NotMcpTool;

        for (self.tools.items) |t| {
            if (std.mem.eql(u8, t.name, tool_name)) {
                const actual = tool_name[prefix.len + t.server_name.len + 2 ..];
                const req = try std.fmt.allocPrint(self.allocator,
                    "{{\"jsonrpc\":\"2.0\",\"id\":{d},\"method\":\"tools/call\",\"params\":{{\"name\":\"{s}\",\"arguments\":{s}}}}}",
                    .{ self.next_id, actual, input_json });
                self.next_id += 1;
                defer self.allocator.free(req);

                for (self.processes.items) |*proc| {
                    const stdin = proc.stdin orelse continue;
                    stdin.writer().print("{s}\n", .{req}) catch continue;
                    var buf: [65536]u8 = undefined;
                    const n = proc.stdout.?.read(&buf) catch continue;
                    if (n == 0) continue;
                    const parsed = std.json.parseFromSlice(std.json.Value, self.allocator, buf[0..n], .{}) catch continue;
                    defer parsed.deinit();
                    const result = parsed.value.object.get("result") orelse continue;
                    const content = (result.object.get("content") orelse continue).array;
                    var out = std.ArrayList(u8).init(self.allocator);
                    for (content.items) |item| {
                        if (item.object.get("text")) |text| try out.appendSlice(text.string);
                    }
                    return out.toOwnedSlice();
                }
                break;
            }
        }
        return error.McpToolNotFound;
    }

    pub fn toolDefs(self: *McpClient, allocator: std.mem.Allocator) ![]llm.ToolDef {
        var defs = try allocator.alloc(llm.ToolDef, self.tools.items.len);
        for (self.tools.items, 0..) |t, i| {
            defs[i] = .{ .name = t.name, .description = t.description, .input_schema_json = t.input_schema_json };
        }
        return defs;
    }
};
