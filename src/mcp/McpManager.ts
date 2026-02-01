import { McpClient } from './McpClient';
import { McpConfigManager, McpServerConfig } from './McpConfig';
import { Tool } from '../tools/Tool';
import ora from 'ora';
import chalk from 'chalk';

export interface McpConnection {
    client: McpClient;
    config: McpServerConfig;
    tools: Tool[];
    connectedAt: Date;
}

export class McpManager {
    private configManager: McpConfigManager;
    private connections: Map<string, McpConnection> = new Map();

    constructor() {
        this.configManager = new McpConfigManager();
    }

    public getConfig(): McpConfigManager {
        return this.configManager;
    }

    public async connectToServer(serverName: string): Promise<McpConnection | null> {
        const config = this.configManager.getServer(serverName);
        if (!config) {
            console.error(chalk.red(`MCP server "${serverName}" not found in configuration`));
            return null;
        }

        // Check if already connected
        if (this.connections.has(serverName)) {
            console.log(chalk.yellow(`Already connected to ${serverName}`));
            return this.connections.get(serverName)!;
        }

        const spinner = ora(`Connecting to MCP server: ${serverName}...`).start();

        try {
            // Set environment variables if specified
            if (config.env) {
                for (const [key, value] of Object.entries(config.env)) {
                    if (value) {
                        process.env[key] = value;
                    } else if (!process.env[key]) {
                        spinner.warn(chalk.yellow(`Environment variable ${key} is required for ${serverName}`));
                        console.log(chalk.dim(`Set it with: export ${key}=your_key`));
                        console.log(chalk.dim(`Or add it to your MCP configuration`));
                    }
                }
            }

            const client = new McpClient(config.command, config.args);
            await client.initialize();
            const tools = await client.listTools();

            const connection: McpConnection = {
                client,
                config,
                tools,
                connectedAt: new Date()
            };

            this.connections.set(serverName, connection);

            spinner.succeed(chalk.green(`Connected to ${client.serverName}!`));
            
            if (tools.length > 0) {
                console.log(chalk.green(`Added ${tools.length} tools:`));
                tools.forEach(t => {
                    const description = t.description.length > 60 
                        ? t.description.substring(0, 60) + '...' 
                        : t.description;
                    console.log(chalk.dim(`  - ${chalk.cyan(t.name)}: ${description}`));
                });
            } else {
                console.log(chalk.yellow('No tools available from this server'));
            }

            return connection;

        } catch (error: any) {
            spinner.fail(chalk.red(`Failed to connect to ${serverName}: ${error.message}`));
            return null;
        }
    }

    public async disconnectFromServer(serverName: string): Promise<boolean> {
        const connection = this.connections.get(serverName);
        if (!connection) {
            console.log(chalk.yellow(`Not connected to ${serverName}`));
            return false;
        }

        try {
            connection.client.disconnect();
            this.connections.delete(serverName);
            console.log(chalk.green(`Disconnected from ${serverName}`));
            return true;
        } catch (error: any) {
            console.error(chalk.red(`Error disconnecting from ${serverName}: ${error.message}`));
            return false;
        }
    }

    public disconnectAll(): void {
        const serverNames = Array.from(this.connections.keys());
        for (const name of serverNames) {
            this.disconnectFromServer(name);
        }
    }

    public getConnections(): McpConnection[] {
        return Array.from(this.connections.values());
    }

    public getConnection(name: string): McpConnection | undefined {
        return this.connections.get(name);
    }

    public getAllTools(): Tool[] {
        const allTools: Tool[] = [];
        for (const connection of this.connections.values()) {
            allTools.push(...connection.tools);
        }
        return allTools;
    }

    public getServerNames(): string[] {
        return Array.from(this.connections.keys());
    }

    public getAvailableServers(): McpServerConfig[] {
        return this.configManager.getConfig().servers;
    }

    public async autoConnect(): Promise<void> {
        const autoConnectServers = this.configManager.getAutoConnectServers();
        
        if (autoConnectServers.length === 0) {
            return;
        }

        console.log(chalk.blue(`\nAuto-connecting to ${autoConnectServers.length} MCP servers...`));
        
        for (const config of autoConnectServers) {
            await this.connectToServer(config.name);
        }
    }

    public async listServers(): Promise<void> {
        const availableServers = this.configManager.getConfig().servers;
        const connectedServers = this.getServerNames();

        if (availableServers.length === 0) {
            console.log(chalk.yellow('No MCP servers configured.'));
            return;
        }

        console.log(chalk.cyan('\nMCP Servers:\n'));

        for (const server of availableServers) {
            const isConnected = connectedServers.includes(server.name);
            const status = isConnected ? chalk.green('● Connected') : chalk.gray('○ Disconnected');
            const auto = server.autoConnect ? chalk.dim('[auto]') : '';
            
            console.log(`${status} ${chalk.bold(server.name)} ${auto}`);
            if (server.description) {
                console.log(chalk.dim(`  ${server.description}`));
            }
            
            if (isConnected) {
                const connection = this.getConnection(server.name);
                if (connection && connection.tools.length > 0) {
                    console.log(chalk.dim(`  Tools: ${connection.tools.map(t => t.name).join(', ')}`));
                }
            }
            console.log('');
        }
    }

    public async addServer(name: string, command: string, args: string[], description?: string): Promise<void> {
        const serverConfig: McpServerConfig = {
            name,
            command,
            args,
            description,
            autoConnect: false
        };

        this.configManager.addServer(serverConfig);
        console.log(chalk.green(`Added MCP server "${name}" to configuration`));
    }

    public async removeServer(name: string): Promise<void> {
        // Disconnect if connected
        if (this.connections.has(name)) {
            await this.disconnectFromServer(name);
        }

        this.configManager.removeServer(name);
        console.log(chalk.green(`Removed MCP server "${name}" from configuration`));
    }

    public async testConnection(serverName: string): Promise<boolean> {
        const connection = this.getConnection(serverName);
        if (!connection) {
            console.log(chalk.red(`Not connected to ${serverName}`));
            return false;
        }

        try {
            // Try to list tools as a test
            await connection.client.listTools();
            console.log(chalk.green(`${serverName} connection is healthy`));
            return true;
        } catch (error: any) {
            console.log(chalk.red(`${serverName} connection test failed: ${error.message}`));
            return false;
        }
    }
}