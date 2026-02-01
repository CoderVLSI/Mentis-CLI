import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface McpServerConfig {
    name: string;
    command: string;
    args: string[];
    description?: string;
    autoConnect?: boolean;
    env?: Record<string, string>;
}

export interface McpConfig {
    servers: McpServerConfig[];
}

export class McpConfigManager {
    private configPath: string;
    private config: McpConfig;

    constructor() {
        // Config path: ~/.mentis/mcp.json
        this.configPath = join(homedir(), '.mentis', 'mcp.json');
        this.config = this.loadConfig();
    }

    private loadConfig(): McpConfig {
        if (existsSync(this.configPath)) {
            try {
                const content = readFileSync(this.configPath, 'utf-8');
                return JSON.parse(content);
            } catch (error) {
                console.warn('Failed to load MCP config, using defaults:', error);
            }
        }

        // Default configuration with popular MCP servers
        return this.getDefaultConfig();
    }

    private getDefaultConfig(): McpConfig {
        return {
            servers: [
                {
                    name: 'Exa Search',
                    command: 'npx',
                    args: ['-y', '@exa-labs/mcp-server-exa'],
                    description: 'Web search via Exa API (requires EXA_API_KEY)',
                    autoConnect: false,
                    env: {
                        EXA_API_KEY: process.env.EXA_API_KEY || ''
                    }
                },
                {
                    name: 'Memory',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-memory'],
                    description: 'Persistent memory storage for conversations',
                    autoConnect: false
                },
                {
                    name: 'Filesystem',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
                    description: 'Enhanced filesystem operations',
                    autoConnect: false
                },
                {
                    name: 'GitHub',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-github'],
                    description: 'GitHub repository management and operations',
                    autoConnect: false,
                    env: {
                        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''
                    }
                },
                {
                    name: 'Puppeteer',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
                    description: 'Web browser automation and scraping',
                    autoConnect: false
                },
                {
                    name: 'Brave Search',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-brave-search'],
                    description: 'Web search via Brave Search API',
                    autoConnect: false,
                    env: {
                        BRAVE_API_KEY: process.env.BRAVE_API_KEY || ''
                    }
                },
                {
                    name: 'Slack',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-slack'],
                    description: 'Slack workspace integration',
                    autoConnect: false,
                    env: {
                        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || ''
                    }
                }
            ]
        };
    }

    public getConfig(): McpConfig {
        return this.config;
    }

    public saveConfig(): void {
        try {
            const dir = join(homedir(), '.mentis');
            if (!existsSync(dir)) {
                require('fs').mkdirSync(dir, { recursive: true });
            }
            writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('Failed to save MCP config:', error);
        }
    }

    public addServer(server: McpServerConfig): void {
        // Remove existing server with same name
        this.config.servers = this.config.servers.filter(s => s.name !== server.name);
        this.config.servers.push(server);
        this.saveConfig();
    }

    public removeServer(name: string): void {
        this.config.servers = this.config.servers.filter(s => s.name !== name);
        this.saveConfig();
    }

    public getServer(name: string): McpServerConfig | undefined {
        return this.config.servers.find(s => s.name === name);
    }

    public getAutoConnectServers(): McpServerConfig[] {
        return this.config.servers.filter(s => s.autoConnect === true);
    }

    public updateServer(name: string, updates: Partial<McpServerConfig>): void {
        const server = this.config.servers.find(s => s.name === name);
        if (server) {
            Object.assign(server, updates);
            this.saveConfig();
        }
    }
}