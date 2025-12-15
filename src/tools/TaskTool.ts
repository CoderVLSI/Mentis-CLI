import { Tool } from './Tool';
import { TaskManager } from '../agent/TaskManager';

export class TaskTool implements Tool {
    name = 'task_manager';
    description = 'Manage your internal task list (add, update, list). Use this to keep track of your own goals.';
    parameters = {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['add', 'update', 'list', 'clear_done'],
                description: 'The action to perform'
            },
            description: {
                type: 'string',
                description: 'Task description (for add action)'
            },
            id: {
                type: 'string',
                description: 'Task ID (for update action)'
            },
            status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed', 'failed'],
                description: 'New status (for update action)'
            }
        },
        required: ['action']
    };

    private manager: TaskManager;

    constructor(manager: TaskManager) {
        this.manager = manager;
    }

    async execute(args: { action: 'add' | 'update' | 'list' | 'clear_done', description?: string, id?: string, status?: 'pending' | 'in_progress' | 'completed' | 'failed' }): Promise<string> {
        switch (args.action) {
            case 'add':
                if (!args.description) return 'Error: description required for add action';
                const id = this.manager.addTask(args.description);
                return `Added task [${id}]: ${args.description}`;

            case 'update':
                if (!args.id || !args.status) return 'Error: id and status required for update action';
                const updated = this.manager.updateTask(args.id, args.status);
                return updated ? `Updated task ${args.id} to ${args.status}` : `Task ${args.id} not found`;

            case 'list':
                const tasks = this.manager.listTasks();
                if (tasks.length === 0) return 'No tasks.';
                return tasks.map(t => `[${t.id}] ${t.description} (${t.status})`).join('\n');

            case 'clear_done':
                this.manager.clearCompleted();
                return 'Cleared completed and failed tasks.';

            default:
                return `Unknown action: ${args.action}`;
        }
    }
}
