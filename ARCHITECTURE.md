# Mentis CLI Architecture

## Overview

Mentis CLI is an agentic, multi-model CLI coding assistant built with TypeScript. It provides an interactive REPL for AI-assisted coding with support for multiple LLM providers (Gemini, Ollama, Anthropic, OpenAI-compatible).

## Project Structure

```
mentis-cli/
├── src/
│   ├── index.ts              # CLI entry point, argument parsing
│   ├── repl/                 # REPL session management
│   │   ├── ReplManager.ts    # Main REPL controller
│   │   └── HistoryManager.ts # Chat history persistence
│   ├── llm/                  # LLM provider implementations
│   │   ├── ModelInterface.ts # Shared interfaces
│   │   ├── Gemini.ts         # Google Gemini provider
│   │   ├── Ollama.ts         # Ollama local provider
│   │   ├── Anthropic.ts      # Anthropic Claude provider
│   │   └── OpenAI.ts         # OpenAI-compatible provider
│   ├── tools/                # Tool implementations
│   │   ├── ToolManager.ts    # Tool registry
│   │   ├── LoadSkillTool.ts  # Agent Skills tool
│   │   └── ...               # Individual tools
│   ├── commands/             # Custom Slash Commands
│   │   ├── Command.ts        # Command interfaces
│   │   └── CommandManager.ts # Command discovery & parsing
│   ├── skills/               # Agent Skills system
│   │   ├── Skill.ts          # Skill interfaces
│   │   ├── SkillsManager.ts  # Skill discovery & validation
│   │   └── LoadSkillTool.ts  # Tool for loading skills
│   ├── ui/                   # User interface
│   │   ├── UIManager.ts      # Display formatting
│   │   └── InputBox.ts       # Input prompt with history
│   ├── mcp/                  # Model Context Protocol
│   │   └── McpManager.ts     # MCP server management
│   └── utils/                # Utilities
│       ├── ContextVisualizer.ts  # Token usage display
│       ├── UpdateManager.ts     # Auto-update
│       └── ...
├── dist/                     # Compiled JavaScript
├── .mentis/                  # Project-specific config
└── package.json
```

## Core Components

### 1. REPL System (`src/repl/`)

The **ReplManager** is the heart of Mentis CLI. It orchestrates the entire conversation flow:

```
User Input → Command Parser → Skill/Command Handler → LLM → Tool Execution → Response
```

**Key responsibilities:**
- Manage chat history with auto-compact at 80% context
- Handle slash commands (`/help`, `/clear`, `/skills`, etc.)
- Inject skills and custom commands into system prompt
- Execute tool calls returned by LLM
- Save/restore session checkpoints

### 2. LLM Abstraction (`src/llm/`)

Each LLM provider implements the `ModelInterface`:

```typescript
interface ModelInterface {
    chat(messages: ChatMessage[], tools?: ToolInfo[]): Promise<ChatResponse>;
    streamChat(messages: ChatMessage[], tools?: ToolInfo[]): AsyncIterator<ChatChunk>;
}
```

**Supported providers:**
- **Gemini** (Google) - Default, supports streaming
- **Ollama** - Local models via API
- **Anthropic** - Claude models
- **OpenAI-compatible** - Custom endpoints

### 3. Tool System (`src/tools/`)

Tools are functions the AI can invoke. Each tool implements:

```typescript
interface Tool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute(params: Record<string, unknown>): Promise<ToolResult>;
}
```

**Available tools:**
- File operations: `Read`, `Write`, `Edit`, `Glob`, `Grep`
- Execution: `Bash`
- Git: `GitStatus`, `GitDiff`, `GitCommit`
- Skills: `LoadSkillTool` (progressive disclosure)

### 4. Agent Skills (`src/skills/`)

Agent Skills are reusable AI configurations stored as `SKILL.md` files:

```
~/.mentis/skills/
└── code-reviewer/
    └── SKILL.md
```

**Features:**
- Progressive disclosure (metadata loaded first, content on-demand)
- Optional tool restrictions
- Validation (name format, description quality)
- Personal vs project scopes

### 5. Custom Commands (`src/commands/`)

Custom slash commands defined as markdown files:

```
~/.mentis/commands/
└── test.md
```

**Features:**
- Parameter substitution (`$1`, `$2`, `$ARGUMENTS`)
- Bash execution (`!`cmd``)
- File references (`@file`)
- Namespace support (subdirectories)

## Data Flow

### Conversation Flow

```
1. User enters input
2. Check for slash commands
3. Inject skills/commands context
4. Call LLM with tools
5. Parse tool calls
6. Execute tools
7. Return results to LLM
8. Stream response to user
9. Update history
10. Check context usage (compact if >80%)
```

### Tool Execution Flow

```
LLM returns tool call
↓
ToolManager finds tool
↓
Validate parameters
↓
Execute tool
↓
Format result
↓
Return to LLM for final response
```

### Skill Loading Flow

```
Startup: Load all skill metadata (name, description)
↓
User mentions skill keyword
↓
LoadSkillTool invoked
↓
Load full SKILL.md content
↓
Inject into system prompt
↓
AI executes with skill context
```

## Configuration

### Environment Variables

```bash
GEMINI_API_KEY=xxx          # Gemini API key
OLLAMA_BASE_URL=http://...  # Ollama endpoint
ANTHROPIC_API_KEY=xxx       # Anthropic key
OPENAI_API_KEY=xxx          # OpenAI-compatible key
OPENAI_BASE_URL=http://...  # Custom endpoint
```

### Dotenv Config (`.mentis.md`)

```yaml
model: gemini-2.5-pro
temperature: 0.7
max_tokens: 8192
```

### Directory Structure

```
~/.mentis/                   # User config
├── skills/                  # Personal skills
├── commands/                # Personal commands
└── checkpoints/             # Session saves

.mentis/                     # Project config
├── skills/                  # Project skills
├── commands/                # Project commands
└── .mentis.md              # Project config file
```

## Testing

Jest tests are located in `src/**/__tests__/`:

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

**Current test coverage:**
- CommandManager - Command parsing, argument substitution
- SkillsManager - Skill discovery, validation
- ContextVisualizer - Token calculation, compacting

## Extension Points

### Adding a New LLM Provider

1. Implement `ModelInterface` in `src/llm/`
2. Add to `ModelFactory.ts`
3. Add CLI option for selection

### Adding a New Tool

1. Create tool class in `src/tools/`
2. Register in `ToolManager.ts`
3. Update documentation

### Adding a New Slash Command

Create `.md` file in `~/.mentis/commands/`:

```markdown
---
description: My custom command
---

Execute: !`echo "$1"`
```

## Performance Considerations

- **Streaming**: All LLM calls use streaming for faster perceived response
- **Progressive Disclosure**: Skills loaded on-demand to reduce startup time
- **Auto-Compact**: History automatically compacted at 80% context to prevent errors
- **Caching**: Discovered skills/commands cached in memory

## Security

- API keys stored in environment variables or `.env`
- No credentials in code or config files
- Tool execution sandboxed (respects system permissions)
- Git operations require explicit confirmation (unless `--yolo`)
