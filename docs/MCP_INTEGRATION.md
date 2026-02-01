# MCP (Model Context Protocol) Integration

Mentis CLI now supports MCP (Model Context Protocol) servers, allowing you to extend functionality with external tools and services.

## Overview

MCP allows you to:
- Connect to external services (search, databases, APIs, etc.)
- Use additional tools beyond the built-in ones
- Create a customizable toolkit for your AI assistant

## Preconfigured MCP Servers

The following MCP servers are pre-configured:

### 1. Exa Search
- **Purpose**: Web search via Exa API
- **Setup**: Requires `EXA_API_KEY` environment variable
- **Command**: `npx -y @exa-labs/mcp-server-exa`

### 2. Memory Server
- **Purpose**: Persistent memory storage for conversations
- **Setup**: No additional configuration required
- **Command**: `npx -y @modelcontextprotocol/server-memory`

### 3. Filesystem Server
- **Purpose**: Enhanced filesystem operations
- **Setup**: No additional configuration required
- **Command**: `npx -y @modelcontextprotocol/server-filesystem <directory>`

### 4. GitHub Server
- **Purpose**: GitHub repository management and operations
- **Setup**: Requires `GITHUB_PERSONAL_ACCESS_TOKEN` environment variable
- **Command**: `npx -y @modelcontextprotocol/server-github`

### 5. Puppeteer Server
- **Purpose**: Web browser automation and scraping
- **Setup**: No additional configuration required
- **Command**: `npx -y @modelcontextprotocol/server-puppeteer`

### 6. Brave Search Server
- **Purpose**: Web search via Brave Search API
- **Setup**: Requires `BRAVE_API_KEY` environment variable
- **Command**: `npx -y @modelcontextprotocol/server-brave-search`

### 7. Slack Server
- **Purpose**: Slack workspace integration
- **Setup**: Requires `SLACK_BOT_TOKEN` environment variable
- **Command**: `npx -y @modelcontextprotocol/server-slack`

## MCP Commands

### List Servers
```bash
/mcp list
```
Shows all configured MCP servers and their connection status.

### Connect to Server
```bash
# Interactive selection
/mcp connect

# Direct connection
/mcp connect "Exa Search"
```

### Disconnect from Server
```bash
# Interactive selection
/mcp disconnect

# Disconnect specific server
/mcp disconnect "Exa Search"

# Disconnect all
/mcp disconnect all
```

### Add Custom Server
```bash
/mcp add "My Server" npx -y @my/mcp-server
```

### Remove Server
```bash
# Interactive selection
/mcp remove

# Remove specific server
/mcp remove "My Server"
```

### Test Connection
```bash
# Interactive selection
/mcp test

# Test specific server
/mcp test "Exa Search"
```

### View Configuration
```bash
/mcp config
```
Shows the full MCP configuration file location and contents.

## Configuration

MCP servers are configured in `~/.mentis/mcp.json`. The configuration includes:

```json
{
  "servers": [
    {
      "name": "Exa Search",
      "command": "npx",
      "args": ["-y", "@exa-labs/mcp-server-exa"],
      "description": "Web search and information retrieval via Exa API",
      "autoConnect": false,
      "env": {
        "EXA_API_KEY": ""
      }
    }
  ]
}
```

### Server Configuration Fields

- `name`: Display name for the server
- `command`: Command to run (e.g., `npx`, `node`)
- `args`: Array of arguments for the command
- `description`: Optional description of what the server does
- `autoConnect`: If `true`, automatically connects on startup
- `env`: Optional environment variables required by the server

## Environment Variables

Some MCP servers require API keys or other configuration:

### Exa Search
```bash
export EXA_API_KEY=your_exa_api_key
```

### GitHub Server
```bash
export GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token
```

### Brave Search
```bash
export BRAVE_API_KEY=your_brave_api_key
```

### Slack Server
```bash
export SLACK_BOT_TOKEN=your_slack_bot_token
```

## Usage Examples

### Exa Search Integration

1. Set up your Exa API key:
   ```bash
   export EXA_API_KEY=your_api_key_here
   ```

2. Connect to the Exa Search server:
   ```bash
   /mcp connect "Exa Search"
   ```

3. Use the search functionality:
   ```
   Search for recent developments in TypeScript
   ```

   The AI will now have access to the Exa search tools and can perform web searches.

### Memory Server

1. Connect to the memory server:
   ```bash
   /mcp connect Memory
   ```

2. The AI can now store and retrieve information across sessions.

### GitHub Integration

1. Set up your GitHub token:
   ```bash
   export GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
   ```

2. Connect to the GitHub server:
   ```bash
   /mcp connect GitHub
   ```

3. Use GitHub functionality:
   ```
   List the recent issues in the mentis-cli repository
   Create a pull request for my changes
   ```

## Auto-Connect

To automatically connect to specific servers on startup, set `autoConnect: true` in the server configuration:

```json
{
  "servers": [
    {
      "name": "Memory",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "autoConnect": true
    }
  ]
}
```

## Troubleshooting

### Connection Issues

1. **Missing API Keys**: Ensure all required environment variables are set
2. **Network Issues**: Check your internet connection
3. **Server Not Found**: Verify the MCP server package is correct

### Test Connection

Use the test command to verify connectivity:
```bash
/mcp test <server_name>
```

### View Logs

MCP connection errors are logged with detailed information. Check the console output for specific error messages.

## Creating Custom MCP Servers

You can add any MCP server to your configuration:

```bash
/mcp add "My Custom Server" node /path/to/my-server.js
```

Or manually edit `~/.mentis/mcp.json`:

```json
{
  "servers": [
    {
      "name": "My Custom Server",
      "command": "node",
      "args": ["/path/to/my-server.js"],
      "description": "My custom MCP server",
      "autoConnect": false
    }
  ]
}
```

## Security Considerations

- **API Keys**: Store API keys securely using environment variables
- **Server Trust**: Only connect to MCP servers from trusted sources
- **File Access**: Be cautious with filesystem servers that have broad access
- **Network**: MCP servers may make network requests on your behalf

## Best Practices

1. **Environment Variables**: Always use environment variables for sensitive data
2. **Minimal Scope**: Configure servers with minimal required permissions
3. **Regular Updates**: Keep MCP server packages updated
4. **Monitor Usage**: Check which tools are being used and how frequently

## Resources

- [MCP Specification](https://modelcontextprotocol.io/)
- [Exa API Documentation](https://docs.exa.ai/)
- [Model Context Protocol GitHub](https://github.com/modelcontextprotocol)
- [Available MCP Servers](https://mcp-examples.now.sh/)