import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';

export interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params?: any;
    id?: number | string;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

export class JsonRpcClient {
    private process: ChildProcess;
    private sequence = 0;
    private pendingRequests = new Map<number | string, { resolve: Function; reject: Function }>();

    constructor(command: string, args: string[]) {
        this.process = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'inherit'], // stdin, stdout, stderr
        });

        if (!this.process.stdout) {
            throw new Error('Failed to open stdout for MCP process');
        }

        const rl = readline.createInterface({ input: this.process.stdout });
        rl.on('line', (line) => this.handleMessage(line));

        this.process.on('error', (err) => console.error('MCP Process Error:', err));
        this.process.on('exit', (code) => console.log('MCP Process Exited:', code));
    }

    private handleMessage(line: string) {
        try {
            if (!line.trim()) return;
            const message = JSON.parse(line);

            // Handle Response
            if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
                const handler = this.pendingRequests.get(message.id);
                if (handler) {
                    this.pendingRequests.delete(message.id);
                    if (message.error) {
                        handler.reject(new Error(message.error.message));
                    } else {
                        handler.resolve(message.result);
                    }
                }
            } else {
                // Handle Notification or Request from server (not implemented deep yet)
                // console.log('Received notification from MCP:', message);
            }
        } catch (e) {
            console.error('Failed to parse MCP message:', line, e);
        }
    }

    public async sendRequest(method: string, params?: any): Promise<any> {
        const id = this.sequence++;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            method,
            params,
            id,
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            try {
                if (!this.process.stdin) throw new Error('Stdin not available');
                const data = JSON.stringify(request) + '\n';
                this.process.stdin.write(data);
            } catch (e) {
                this.pendingRequests.delete(id);
                reject(e);
            }
        });
    }

    public sendNotification(method: string, params?: any) {
        if (!this.process.stdin) return;
        const notification: JsonRpcRequest = {
            jsonrpc: '2.0',
            method,
            params,
        };
        this.process.stdin.write(JSON.stringify(notification) + '\n');
    }

    public disconnect() {
        this.process.kill();
    }
}
