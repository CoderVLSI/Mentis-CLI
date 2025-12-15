import { Tool } from './Tool';
import { ProcessManager } from '../sys/ProcessManager';

export class BackgroundProcessTool implements Tool {
    name = 'background_process';
    description = 'Manage long-running background processes (start, stop, list, logs).';
    parameters = {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['start', 'stop', 'list', 'logs'],
                description: 'The action to perform'
            },
            command: {
                type: 'string',
                description: 'Command to run (for start action)'
            },
            args: {
                type: 'array',
                items: { type: 'string' },
                description: 'Arguments for the command (for start action)'
            },
            id: {
                type: 'string',
                description: 'Process ID (for stop/logs actions)'
            }
        },
        required: ['action']
    };

    private manager: ProcessManager;

    constructor(manager: ProcessManager) {
        this.manager = manager;
    }

    async execute(args: { action: 'start' | 'stop' | 'list' | 'logs', command?: string, args?: string[], id?: string }): Promise<string> {
        try {
            switch (args.action) {
                case 'start':
                    if (!args.command) return 'Error: command required for start action';
                    const id = this.manager.start(args.command, args.args || []);
                    return `Started process ${args.command} with ID: ${id}`;

                case 'stop':
                    if (!args.id) return 'Error: id required for stop action';
                    const stopped = this.manager.stop(args.id);
                    return stopped ? `Stopped process ${args.id}` : `Failed to stop ${args.id} (not found or not running)`;

                case 'list':
                    const list = this.manager.list();
                    if (list.length === 0) return 'No background processes.';
                    return list.map(p => `[${p.id}] ${p.command} (${p.status}, uptime: ${p.uptime})`).join('\n');

                case 'logs':
                    if (!args.id) return 'Error: id required for logs action';
                    const logs = this.manager.getLogs(args.id);
                    return logs.length > 0 ? logs.join('\n') : 'No logs available.';

                default:
                    return `Unknown action: ${args.action}`;
            }
        } catch (error: any) {
            return `Error managing process: ${error.message}`;
        }
    }
}
