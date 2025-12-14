import { JsonRpcClient } from './JsonRpcClient';
import { Tool } from '../tools/Tool';

export class McpClient {
    private rpc: JsonRpcClient;
    public serverName: string = 'unknown';

    constructor(command: string, args: string[]) {
        this.rpc = new JsonRpcClient(command, args);
    }

    async initialize() {
        const result = await this.rpc.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
                name: 'mentis-cli',
                version: '1.0.0',
            },
        });

        this.serverName = result.serverInfo.name;

        // Notify initialized
        this.rpc.sendNotification('notifications/initialized');
        return result;
    }

    async listTools(): Promise<Tool[]> {
        const result = await this.rpc.sendRequest('tools/list');
        const mcpTools = result.tools || [];

        return mcpTools.map((t: any) => new McpToolAdapter(this, t));
    }

    async callTool(name: string, args: any): Promise<any> {
        return this.rpc.sendRequest('tools/call', {
            name,
            arguments: args,
        });
    }

    disconnect() {
        this.rpc.disconnect();
    }
}

class McpToolAdapter implements Tool {
    private client: McpClient;
    public name: string;
    public description: string;
    public parameters: any;

    constructor(client: McpClient, toolDef: any) {
        this.client = client;
        this.name = toolDef.name;
        this.description = toolDef.description || '';
        this.parameters = toolDef.inputSchema || {};
    }

    async execute(args: any): Promise<string> {
        const result = await this.client.callTool(this.name, args);
        // MCP returns { content: [ { type: 'text', text: '...' } ], isError: boolean }
        if (result.isError) {
            throw new Error('MCP Tool Error');
        }

        // Extract text content
        if (result.content && Array.isArray(result.content)) {
            return result.content.map((c: any) => c.text).join('\n');
        }

        return JSON.stringify(result);
    }
}
