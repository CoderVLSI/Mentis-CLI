import { v4 as uuidv4 } from 'uuid';

interface Task {
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    created: number;
    updated: number;
}

export class TaskManager {
    private tasks: Map<string, Task> = new Map();

    public addTask(description: string): string {
        const id = uuidv4().substring(0, 8);
        this.tasks.set(id, {
            id,
            description,
            status: 'pending',
            created: Date.now(),
            updated: Date.now()
        });
        return id;
    }

    public updateTask(id: string, status: 'pending' | 'in_progress' | 'completed' | 'failed'): boolean {
        const task = this.tasks.get(id);
        if (task) {
            task.status = status;
            task.updated = Date.now();
            return true;
        }
        return false;
    }

    public listTasks(): Task[] {
        return Array.from(this.tasks.values()).sort((a, b) => b.created - a.created);
    }

    public getActiveTask(): Task | undefined {
        return Array.from(this.tasks.values()).find(t => t.status === 'in_progress');
    }

    public clearCompleted() {
        for (const [id, task] of this.tasks) {
            if (task.status === 'completed' || task.status === 'failed') {
                this.tasks.delete(id);
            }
        }
    }
}
