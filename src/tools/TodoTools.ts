/**
 * TodoTools - Task tracking tools for Mentis CLI
 *
 * Provides TodoWrite and TodoRead so the AI can track its own progress
 * on multi-step tasks, mirroring Claude Code's built-in task system.
 *
 * Usage by the AI:
 *   1. Call todo_write at the start of a complex task with all steps as 'pending'.
 *   2. Update each item to 'in_progress' when starting it.
 *   3. Update to 'completed' when done.
 *   4. Call todo_read at any point to review remaining work.
 */

import { Tool } from './Tool';
import chalk from 'chalk';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';
export type TodoPriority = 'high' | 'medium' | 'low';

export interface TodoItem {
    id: string;
    content: string;
    status: TodoStatus;
    priority: TodoPriority;
}

// In-memory store shared between instances within a session.
let todoList: TodoItem[] = [];

export class TodoWriteTool implements Tool {
    name = 'todo_write';
    description = [
        'Create or update the task list for the current session.',
        'Use this to track progress on multi-step tasks.',
        'The provided list REPLACES the existing list entirely.',
        'Call this when starting a complex task, and update statuses as you progress.',
    ].join(' ');

    parameters = {
        type: 'object',
        properties: {
            todos: {
                type: 'array',
                description: 'Complete replacement task list.',
                items: {
                    type: 'object',
                    properties: {
                        id:       { type: 'string', description: 'Unique task ID (e.g. "1", "2")' },
                        content:  { type: 'string', description: 'Task description' },
                        status:   { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
                        priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                    },
                    required: ['id', 'content', 'status', 'priority'],
                },
            },
        },
        required: ['todos'],
    };

    async execute(args: { todos: any[] }): Promise<string> {
        // Normalize field names — models sometimes use text/task/description instead of content
        todoList = (args.todos ?? []).map((t: any, i: number) => ({
            id:       String(t.id ?? i + 1),
            content:  t.content ?? t.text ?? t.task ?? t.description ?? t.title ?? 'Untitled task',
            status:   t.status ?? 'pending',
            priority: t.priority ?? 'medium',
        }));
        this.display();
        const done = todoList.filter(t => t.status === 'completed').length;
        return `Todo list updated: ${done}/${todoList.length} completed.`;
    }

    private display(): void {
        if (todoList.length === 0) return;

        console.log('');
        console.log(chalk.bold('  Tasks'));
        console.log(chalk.gray('  ' + '─'.repeat(44)));

        for (const todo of todoList) {
            const icon =
                todo.status === 'completed'  ? chalk.green('✓') :
                todo.status === 'in_progress'? chalk.yellow('◎') :
                                               chalk.gray('○');

            const priority =
                todo.priority === 'high'  ? chalk.red('[H]') :
                todo.priority === 'medium'? chalk.yellow('[M]') :
                                            chalk.gray('[L]');

            const text = todo.status === 'completed'
                ? chalk.gray(todo.content)
                : todo.content;

            console.log(`  ${icon} ${priority} ${text}`);
        }
        console.log('');
    }
}

export class TodoReadTool implements Tool {
    name = 'todo_read';
    description = 'Read the current task list to check progress or see what remains.';

    parameters = {
        type: 'object',
        properties: {},
        required: [],
    };

    async execute(_args: Record<string, never>): Promise<string> {
        if (todoList.length === 0) {
            return 'No tasks in the todo list.';
        }
        return JSON.stringify(todoList, null, 2);
    }
}

/** Reset the in-memory list (called on /clear or session start). */
export function clearTodos(): void {
    todoList = [];
}
