# Mentis CLI

> Agentic AI coding assistant for your terminal — multi-model, subagents, hooks, MCP, and a Tamagotchi sidekick.

```bash
npm install -g @indiccoder/mentis-cli
mentis
```

---

## Features

**Multi-model** — Switch between Claude (Anthropic), Gemini, GPT-4o, Ollama (local), GLM and others via a single config.

**Agentic tools** — Read, write, edit files, run shell commands, grep, git operations. Asks permission before writing by default.

**Subagents** — Spawn isolated AI agents for parallel or specialized tasks (`spawn_agent`, `spawn_agents_parallel`). Six built-in agents: `web-researcher`, `code-explorer`, `code-reviewer`, `test-runner`, `frontend`, `sidekick`. Define custom agents with markdown + YAML frontmatter in `.mentis/agents/`.

**Hooks** — Run shell commands on lifecycle events: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`. Configure in `settings.json`. `PreToolUse` hooks can block tool execution.

**Permissions** — Per-tool allow/ask/deny modes. Defaults: writes/edits/shell/git-push → `ask`, reads → `allow`. Configurable in `settings.json`.

**MCP (Model Context Protocol)** — Full MCP client with a curated registry of 18 servers. Install any MCP in one command:

```
/mcp search           # browse registry by category
/mcp install chrome-devtools
/mcp install playwright
/mcp install github
```

**Prompt caching** — Native Anthropic SDK with automatic prompt caching. System prompt always cached; conversation history cached every 10 messages. Shows cache hit tokens in usage output.

**Project instructions** — Drop a `.mentis.md` in your project root (or any parent directory). It's injected into the system prompt automatically every session. Run `/init` to generate one.

**Sidekick** — A Tamagotchi-style coding companion generated deterministically from your machine identity. Evolves mood based on session activity. Use `/sidekick hatch` to get yours.

**Web** — `web_search` (Serper/DuckDuckGo) and `web_fetch` (direct URL fetch + HTML strip) built in.

**Todo tracking** — `todo_write` / `todo_read` tools let the AI track task progress across a session.

**Context + memory** — Model-aware context budgets reserve room for the response, compact older turns without breaking tool-call history, and carry durable project/user facts across sessions.

---

## Installation

```bash
npm install -g @indiccoder/mentis-cli
mentis
```

Or from source:

```bash
git clone https://github.com/CoderVLSI/Mentis-CLI.git
cd Mentis-CLI
npm install && npm run build && npm link
```

---

## Quick Start

```bash
mentis
```

On first run, type `/model` to configure your provider and API key.

```
/model
# → Select provider: Anthropic / Gemini / OpenAI / Ollama / GLM
# → Enter model name and API key
# → Saved to ~/.mentisrc
```

---

## Providers

| Provider | Models | Setup |
|---|---|---|
| **Anthropic** | claude-fable-5, claude-opus-5, claude-sonnet-5, claude-haiku-4-5 | `ANTHROPIC_API_KEY` — includes prompt caching and effort control |
| **Gemini** | gemini-3.6-flash, gemini-3.5-flash, gemini-3.1-pro-preview | `GEMINI_API_KEY` — supported models include effort control |
| **OpenAI** | gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.3-codex | `OPENAI_API_KEY` — supported models include effort control |
| **Ollama** | llama3, deepseek-coder, qwen2.5 | Local, no key needed |
| **GLM** | glm-4-plus | Z.AI API key |

---

## Commands

| Command | Description |
|---|---|
| `/help` | Show all commands |
| `/model` | Configure provider and model |
| `/model <id> [effort]` | Set a model directly, optionally with its supported effort |
| `/effort [default\|none\|minimal\|low\|medium\|high\|xhigh\|max]` | Inspect or change provider-aware reasoning effort |
| `/plan` | Switch to planning mode |
| `/build` | Switch to build mode |
| `/mcp search [query]` | Browse/search MCP registry |
| `/mcp install <slug>` | Install an MCP from the registry |
| `/mcp connect <name>` | Connect to a configured MCP |
| `/mcp list` | List configured MCPs |
| `/sidekick hatch` | Hatch your coding sidekick |
| `/sidekick card` | Show sidekick stats card |
| `/sidekick interact` | Interact with your sidekick |
| `/sidekick toggle` | Toggle session-start banner |
| `/init` | Generate `.mentis.md` project instructions |
| `/add <file>` | Add file to context |
| `/drop <file>` | Remove file from context |
| `/resume` | Resume last session |
| `/checkpoint` | Manage saved sessions |
| `/context` | Show the current model's input budget and compaction thresholds |
| `/memory` | List, add, delete, or clear persistent user/project facts |
| `/search <query>` | Search codebase with grep |
| `/commit [msg]` | Stage and commit changes |
| `/run <cmd>` | Run a shell command |
| `/skills` | Manage reusable skill scripts |
| `/clear` | Clear context and todos |
| `/exit` | Save session and exit |

---

## MCP Registry

Mentis ships with a curated registry of 18 MCPs installable via `/mcp install <slug>`:

| Slug | Description |
|---|---|
| `chrome-devtools` | Official Chrome DevTools — JS eval, console logs, Lighthouse, screenshots |
| `playwright` | Cross-browser automation (Chrome, Firefox, Safari, Edge) |
| `puppeteer` | Headless Chrome scraping |
| `exa` | Neural web search (requires `EXA_API_KEY`) |
| `brave-search` | Brave Search API |
| `tavily` | AI-optimised search |
| `github` | GitHub repos, issues, PRs |
| `linear` | Linear issue tracker |
| `notion` | Notion pages and databases |
| `postgres` | PostgreSQL query and inspect |
| `sqlite` | SQLite databases |
| `slack` | Slack channels and messages |
| `filesystem` | Enhanced file operations |
| `memory` | Persistent key-value memory |
| `sequential-thinking` | Structured reasoning |
| `cloudflare` | Cloudflare Workers, KV, R2, D1 |

---

## Hooks

Configure hooks in `.mentis/settings.json` (project) or `~/.mentis/settings.json` (global):

```json
{
  "hooks": {
    "SessionStart": [{ "command": "echo 'Mentis started'" }],
    "PreToolUse":   [{ "command": "./hooks/approve.sh", "blocking": true }],
    "PostToolUse":  [{ "command": "./hooks/log.sh" }],
    "Stop":         [{ "command": "./hooks/cleanup.sh" }]
  },
  "permissions": {
    "run_shell": "ask",
    "write_file": "ask",
    "git_push": "deny",
    "read_file": "allow"
  },
  "context": {
    "autoCompact": true,
    "compactAtPercent": 80,
    "forceCompactAtPercent": 95,
    "keepRecentTurns": 4
  }
}
```

Hook env vars: `MENTIS_HOOK_EVENT`, `MENTIS_TOOL_NAME`, `MENTIS_TOOL_ARGS`, `MENTIS_TOOL_RESULT`, `MENTIS_SESSION_ID`.

Context compaction runs before model requests and between tool rounds. It summarizes older turns while retaining recent messages and complete tool-call/result groups. Set `autoCompact` to `false` to prompt at the normal threshold; the forced threshold remains a safety backstop.

Memory commands use either `global` (all projects) or `project` (current folder) scope:

```bash
/memory list
/memory add project test-command "npm test"
/memory delete project test-command
/memory clear global
```

---

## Project Instructions (.mentis.md)

Create a `.mentis.md` in your project root. It's injected into every session automatically:

```bash
/init   # generate one interactively
```

Mentis walks up the directory tree and loads all `.mentis.md` files it finds, outermost-first, so global instructions can be set in `~/.mentis/MENTIS.md`.

---

## Subagents

Spawn isolated agents from within a conversation:

```
spawn_agent(agent="code-reviewer", task="Review src/auth for security issues")
spawn_agents_parallel(agents=[
  { agent: "code-explorer", task: "Map the auth module" },
  { agent: "web-researcher", task: "Find latest JWT best practices" }
])
```

Define custom agents in `.mentis/agents/my-agent.md`:

```markdown
---
name: my-agent
description: Does a specific thing
tools: [read_file, run_shell]
---
You are a specialist in...
```

---

## Sidekick

Your sidekick is generated deterministically from your machine identity — same machine always produces the same species, rarity, and stats. Name and personality are generated by the LLM on first hatch.

```
/sidekick hatch     # generates name + personality via LLM
/sidekick card      # full stats card with ASCII art
/sidekick interact  # mood-based interaction
/sidekick toggle    # toggle session-start banner on/off
```

18 species (daemon, pixel, seggy, regex, nibble, repl, null, hexer, stack, lambda, goroutine, recursion, cache, token, mutex, promise, shard, bit), 5 rarities (1% legendary), mood engine, XP levelling, daily streak. Saved to `~/.mentis/sidekick.json`.

---

## License

ISC
