import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

interface ProcessInfo {
    id: string;
    command: string;
    args: string[];
    startTime: number;
    status: 'running' | 'stopped' | 'failed';
    process?: ChildProcessWithoutNullStreams;
    logs: string[];
}

export class ProcessManager {
    private processes: Map<string, ProcessInfo> = new Map();

    public start(command: string, args: string[] = []): string {
        const id = uuidv4().substring(0, 8);
        const process = spawn(command, args, { stdio: 'pipe', shell: true }); // Use shell for better compatibility

        const info: ProcessInfo = {
            id,
            command,
            args,
            startTime: Date.now(),
            status: 'running',
            process,
            logs: []
        };

        process.stdout.on('data', (data) => {
            const log = `[STDOUT] ${data.toString().trim()}`;
            info.logs.push(log);
            // Keep logs reasonable size
            if (info.logs.length > 1000) info.logs.shift();
        });

        process.stderr.on('data', (data) => {
            const log = `[STDERR] ${data.toString().trim()}`;
            info.logs.push(log);
            if (info.logs.length > 1000) info.logs.shift();
        });

        process.on('close', (code) => {
            info.status = 'stopped';
            info.logs.push(`[EXIT] Process exited with code ${code}`);
            // Don't delete immediately so user can check logs
        });

        process.on('error', (err) => {
            info.status = 'failed';
            info.logs.push(`[ERROR] Failed to start: ${err.message}`);
        });

        this.processes.set(id, info);
        return id;
    }

    public stop(id: string): boolean {
        const info = this.processes.get(id);
        if (info && info.process && info.status === 'running') {
            info.process.kill();
            info.status = 'stopped';
            return true;
        }
        return false;
    }

    public list(): { id: string, command: string, status: string, uptime: string }[] {
        return Array.from(this.processes.values()).map(p => ({
            id: p.id,
            command: `${p.command} ${p.args.join(' ')}`,
            status: p.status,
            uptime: p.status === 'running' ? `${Math.floor((Date.now() - p.startTime) / 1000)}s` : '0s'
        }));
    }

    public getLogs(id: string, lines: number = 50): string[] {
        const info = this.processes.get(id);
        if (!info) return [];
        return info.logs.slice(-lines);
    }

    public killAll() {
        for (const p of this.processes.values()) {
            if (p.status === 'running' && p.process) {
                p.process.kill();
            }
        }
        this.processes.clear();
    }
}
