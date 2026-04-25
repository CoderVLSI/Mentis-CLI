# Mentis-CLI 🧠
> **An Agentic, Multi-Model CLI Coding Assistant.**

Mentis is a powerful terminal-based AI coding assistant that lives in your command line. It supports multiple LLM providers (Gemini, Ollama, OpenAI), agentic file operations, MCP (Model Context Protocol), and more.

## ✨ Features

*   **🤖 Multi-Model Support**: Switch seamlessly between **Gemini**, **Ollama** (Local), **OpenAI**, and **GLM-4.6** (Z.AI Coding).
*   **🛠️ Agentic Capabilities**: Mentis can read, write, list files, and search your codebase to understand context.
*   **🌐 Web Intelligence**: Hybrid search for documentation and error fixing.
*   **🗺️ Smart Context**: Automatically maps your repository structure.
*   **🧩 Interactive & Robust CLI**:
    *   **History**: Navigate previous commands with Up/Down arrows (persistent across sessions).
    *   **Cancellation**: Press `Esc` to instantly stop generation.
    *   **Markdown**: Beautiful syntax highlighting in terminal output.
*   **💰 Cost Awareness**: Real-time token usage and cost tracking.
*   **🧠 Persistent Memory**: Auto-saves sessions (`/resume`) and checkpoints (`/checkpoint`).
*   **🔌 MCP Support**: Full [Model Context Protocol](https://github.com/modelcontextprotocol) client.
*   **🔍 Codebase Search**: Built-in `grep` tool.
*   **🐚 Shell Integration**: Run shell commands and commit changes directly.

## 🚀 Installation

### Using NPM (Recommended)
You can install Mentis globally directly from the NPM registry:

```bash
npm install -g @indiccoder/mentis-cli
```


### From Source (Dev)
```bash
git clone https://github.com/CoderVLSI/Mentis-CLI.git
cd Mentis-CLI
npm install
npm run build
npm link
```

### Windows — Native Module Compilation

Mentis includes `screenshot-desktop` which compiles a native addon on Windows. If `npm install` fails with a node-gyp error, Python is required.

**npm v10+ (current):** The `npm config set python` command was removed. Use an environment variable instead — set it in the same shell session before running `npm install`:

```powershell
# PowerShell
$env:npm_config_python = "C:\path\to\python.exe"
npm install -g @indiccoder/mentis-cli
```

```cmd
:: Command Prompt
set npm_config_python=C:\path\to\python.exe
npm install -g @indiccoder/mentis-cli
```

Alternatively, add the following line directly to your user `.npmrc` file (`%USERPROFILE%\.npmrc`) — **do not** use `npm config set python` as it will error on npm v10+:

```ini
python=C:\path\to\python.exe
```

**Finding your Python path:** If you manage Python with [uv](https://github.com/astral-sh/uv), the executable is typically at:
```
%APPDATA%\uv\python\cpython-<version>-windows-x86_64-none\python.exe
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

### Web Search (Optional)

Mentis includes web search capabilities for documentation and error solving. To enable it:

1. **Get a free Tavily API key** at https://tavily.com
2. Add to your `.env` file in your project directory:
   ```
   TAVILY_API_KEY=your_key_here
   ```

Alternatively, you can use **Exa** via MCP:
```bash
export EXA_API_KEY=your_key_here
mentis
/mcp connect "Exa Search"
```

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
