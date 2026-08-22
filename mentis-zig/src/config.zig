const std = @import("std");

pub const Provider = enum {
    anthropic,
    gemini,
    ollama,
    openai,

    pub fn fromString(s: []const u8) ?Provider {
        if (std.mem.eql(u8, s, "anthropic")) return .anthropic;
        if (std.mem.eql(u8, s, "gemini")) return .gemini;
        if (std.mem.eql(u8, s, "ollama")) return .ollama;
        if (std.mem.eql(u8, s, "openai")) return .openai;
        return null;
    }
};

pub const Config = struct {
    provider: Provider,
    model: []u8,
    anthropic_key: []u8,
    gemini_key: []u8,
    openai_key: []u8,
    openai_base_url: []u8,
    ollama_base_url: []u8,
    max_tokens: u32,
    temperature: f32,
    yolo: bool,
    pipe_mode: bool,
    json_output: bool,
    auto_compact_threshold: f32,

    pub fn deinit(self: *Config, allocator: std.mem.Allocator) void {
        allocator.free(self.model);
        allocator.free(self.anthropic_key);
        allocator.free(self.gemini_key);
        allocator.free(self.openai_key);
        allocator.free(self.openai_base_url);
        allocator.free(self.ollama_base_url);
    }
};

pub fn load(allocator: std.mem.Allocator) !Config {
    var cfg = Config{
        .provider = .gemini,
        .model = try allocator.dupe(u8, "gemini-2.5-pro"),
        .anthropic_key = try allocator.dupe(u8, ""),
        .gemini_key = try allocator.dupe(u8, ""),
        .openai_key = try allocator.dupe(u8, ""),
        .openai_base_url = try allocator.dupe(u8, "https://api.openai.com"),
        .ollama_base_url = try allocator.dupe(u8, "http://localhost:11434"),
        .max_tokens = 8192,
        .temperature = 0.7,
        .yolo = false,
        .pipe_mode = false,
        .json_output = false,
        .auto_compact_threshold = 0.8,
    };

    // Load env vars
    if (std.process.getEnvVarOwned(allocator, "ANTHROPIC_API_KEY") catch null) |v| {
        allocator.free(cfg.anthropic_key);
        cfg.anthropic_key = v;
        cfg.provider = .anthropic;
        allocator.free(cfg.model);
        cfg.model = try allocator.dupe(u8, "claude-sonnet-4-6");
    }
    if (std.process.getEnvVarOwned(allocator, "GEMINI_API_KEY") catch null) |v| {
        allocator.free(cfg.gemini_key);
        cfg.gemini_key = v;
        if (cfg.provider != .anthropic) {
            cfg.provider = .gemini;
            allocator.free(cfg.model);
            cfg.model = try allocator.dupe(u8, "gemini-2.5-pro");
        }
    }
    if (std.process.getEnvVarOwned(allocator, "OPENAI_API_KEY") catch null) |v| {
        allocator.free(cfg.openai_key);
        cfg.openai_key = v;
    }
    if (std.process.getEnvVarOwned(allocator, "OPENAI_BASE_URL") catch null) |v| {
        allocator.free(cfg.openai_base_url);
        cfg.openai_base_url = v;
    }
    if (std.process.getEnvVarOwned(allocator, "OLLAMA_BASE_URL") catch null) |v| {
        allocator.free(cfg.ollama_base_url);
        cfg.ollama_base_url = v;
    }
    if (std.process.getEnvVarOwned(allocator, "MENTIS_MODEL") catch null) |v| {
        allocator.free(cfg.model);
        cfg.model = v;
    }

    // Parse .mentis.md project config if present
    parseMentisFile(allocator, &cfg, ".mentis/.mentis.md") catch {};

    // Parse user-level config
    if (std.process.getEnvVarOwned(allocator, "HOME") catch null) |home| {
        defer allocator.free(home);
        const path = try std.fmt.allocPrint(allocator, "{s}/.mentis/.mentis.md", .{home});
        defer allocator.free(path);
        parseMentisFile(allocator, &cfg, path) catch {};
    }

    return cfg;
}

// Parse YAML-ish frontmatter from .mentis.md
fn parseMentisFile(allocator: std.mem.Allocator, cfg: *Config, path: []const u8) !void {
    const file = try std.fs.cwd().openFile(path, .{});
    defer file.close();
    const content = try file.reader().readAllAlloc(allocator, 64 * 1024);
    defer allocator.free(content);

    var lines = std.mem.splitScalar(u8, content, '\n');
    while (lines.next()) |line| {
        const trimmed = std.mem.trim(u8, line, " \t\r");
        if (std.mem.startsWith(u8, trimmed, "model:")) {
            const val = std.mem.trim(u8, trimmed[6..], " ");
            allocator.free(cfg.model);
            cfg.model = try allocator.dupe(u8, val);
        } else if (std.mem.startsWith(u8, trimmed, "provider:")) {
            const val = std.mem.trim(u8, trimmed[9..], " ");
            if (Provider.fromString(val)) |p| cfg.provider = p;
        } else if (std.mem.startsWith(u8, trimmed, "max_tokens:")) {
            const val = std.mem.trim(u8, trimmed[11..], " ");
            cfg.max_tokens = std.fmt.parseInt(u32, val, 10) catch cfg.max_tokens;
        } else if (std.mem.startsWith(u8, trimmed, "temperature:")) {
            const val = std.mem.trim(u8, trimmed[12..], " ");
            cfg.temperature = std.fmt.parseFloat(f32, val) catch cfg.temperature;
        }
    }
}
