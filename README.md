# Mentis-CLI 🧠
> **An Agentic, Multi-Model CLI Coding Assistant.**

Mentis is a powerful terminal-based AI coding assistant that lives in your command line. It supports multiple LLM providers (Gemini, Ollama, OpenAI), agentic file operations, MCP (Model Context Protocol), and more.

## ✨ Features

*   **🤖 Multi-Model Support**: Switch seamlessly between **Gemini**, **Ollama** (Local), and **OpenAI**.
*   **🛠️ Agentic Capabilities**: Mentis can read, write, list files, and search your codebase to understand context.
*   **🌐 Web Intelligence**: Hybrid **Google** + **DuckDuckGo** search for documentation and error fixing (Zero-Config).
*   **🗺️ Smart Context**: Automatically maps your repository structure for better spatial awareness.
*   **💰 Cost Awareness**: Real-time token usage and cost estimation displayed after every response.
*   **🧠 Persistent Memory**: Auto-saves sessions (`/resume`) and supports manual checkpoints (`/checkpoint`).
*   **🔌 MCP Support**: Full [Model Context Protocol](https://github.com/modelcontextprotocol) client. Connect external tools like databases or memory servers.
*   **🔍 Codebase Search**: Built-in `grep` tool to find code across your project.
*   **🐚 Shell Integration**: Run shell commands (`/run`) and commit changes (`/commit`) directly from the agent.
*   **🎨 Premium UI**: Beautiful terminal interface with modes (`PLAN` vs `BUILD`).

## 🚀 Installation

### From NPM (Recommended)
```bash
npm install -g mentis-cli
```

### From Source
```bash
git clone https://github.com/CoderVLSI/Mentis-CLI.git
cd Mentis-CLI
npm install
npm run build
npm link
```

## ⚙️ Configuration

Start Mentis by typing:
```bash
mentis
```

### Setting up Models
Type `/model` inside the CLI to launch the interactive configuration wizard:
1.  **Select Provider**: Gemini, Ollama, or OpenAI.
2.  **Select Model**: e.g., `gemini-2.5-flash`, `llama3`.
3.  **Enter Credentials**: API Key (for cloud) or Base URL (for local).

*Credentials are stored securely in `~/.mentisrc`.*

## 📖 Usage

### Modes
*   **/plan**: Switch to high-level planning mode (Architecture, requirements).
*   **/build**: Switch to code generation mode (Implementation).

### Commands
| Command | Description |
| :--- | :--- |
| `/help` | Show available commands |
| `/model` | Configure AI provider and model (Interactive) |
| `/resume` | Resume the last session |
| `/checkpoint` | Manage saved sessions (`save`, `load`, `list`) |
| `/search <query>` | Search for code in the current directory |
| `/mcp connect <cmd>` | Connect an MCP Server (e.g., `npx -y @modelcontextprotocol/server-time`) |
| `/run <cmd>` | Execute a shell command |
| `/commit [msg]` | Stage and commit changes to Git |
| `/add <file>` | Add a specific file to context |
| `/drop <file>` | Remove a file from context |
| `/clear` | Clear chat history |
| `/exit` | Save and exit |

### Example Workflow
```text
Mentis > /plan
[PLAN] > Analyze this project structure and suggest improvements.

Mentis > /build
[BUILD] > Implement the FolderManager class in src/utils.ts.
```

## 🔒 Safety
Mentis asks for **explicit approval** before writing or modifying any files, keeping you in control.

## 🤝 Contributing
Pull requests are welcome!

## 📄 License
ISC
