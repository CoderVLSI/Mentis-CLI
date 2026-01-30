import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { ChatMessage } from '../llm/ModelInterface';

export interface Checkpoint {
    timestamp: number;
    name: string;
    history: ChatMessage[];
    files: string[];
}

export class CheckpointManager {
    private checkpointDir: string;

    constructor() {
        this.checkpointDir = path.join(os.homedir(), '.mentis', 'checkpoints');
        fs.ensureDirSync(this.checkpointDir);
    }

    public save(name: string, history: ChatMessage[], files: string[]) {
        const checkpoint: Checkpoint = {
            timestamp: Date.now(),
            name,
            history,
            files
        };
        const filePath = path.join(this.checkpointDir, `${name}.json`);
        fs.writeJsonSync(filePath, checkpoint, { spaces: 2 });
        return filePath;
    }

    public load(name: string): Checkpoint | null {
        const filePath = path.join(this.checkpointDir, `${name}.json`);
        if (fs.existsSync(filePath)) {
            return fs.readJsonSync(filePath) as Checkpoint;
        }
        return null;
    }

    public list(): string[] {
        if (!fs.existsSync(this.checkpointDir)) return [];
        return fs.readdirSync(this.checkpointDir)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    }

    public delete(name: string): boolean {
        const filePath = path.join(this.checkpointDir, `${name}.json`);
        if (fs.existsSync(filePath)) {
            fs.removeSync(filePath);
            return true;
        }
        return false;
    }

    public exists(name: string): boolean {
        const filePath = path.join(this.checkpointDir, `${name}.json`);
        return fs.existsSync(filePath);
    }

    // ─── Per-Directory Local Session Methods ───────────────────────────────

    private getLocalSessionsDir(cwd: string): string {
        return path.join(cwd, '.mentis', 'sessions');
    }

    public saveLocalSession(cwd: string, history: ChatMessage[], files: string[]): string {
        const timestamp = Date.now();
        const checkpoint: Checkpoint = {
            timestamp,
            name: `session-${timestamp}`,
            history,
            files
        };
        const sessionsDir = this.getLocalSessionsDir(cwd);
        fs.ensureDirSync(sessionsDir);
        const filePath = path.join(sessionsDir, `${timestamp}.json`);
        fs.writeJsonSync(filePath, checkpoint, { spaces: 2 });
        return filePath;
    }

    public loadLocalSession(cwd: string, sessionId?: string): Checkpoint | null {
        const sessionsDir = this.getLocalSessionsDir(cwd);
        if (!fs.existsSync(sessionsDir)) return null;

        let filePath: string;
        if (sessionId) {
            filePath = path.join(sessionsDir, `${sessionId}.json`);
        } else {
            // Load most recent
            const sessions = this.listLocalSessions(cwd);
            if (sessions.length === 0) return null;
            filePath = path.join(sessionsDir, `${sessions[0].id}.json`);
        }

        if (fs.existsSync(filePath)) {
            return fs.readJsonSync(filePath) as Checkpoint;
        }
        return null;
    }

    public listLocalSessions(cwd: string): Array<{ id: string; timestamp: number; messageCount: number; preview: string }> {
        const sessionsDir = this.getLocalSessionsDir(cwd);
        if (!fs.existsSync(sessionsDir)) return [];

        const files = fs.readdirSync(sessionsDir);

        return files
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const filePath = path.join(sessionsDir, f);
                try {
                    const data = fs.readJsonSync(filePath) as Checkpoint;
                    // Extract meaningful preview from LAST user message (to show current state)
                    const lastUserMsg = [...(data.history || [])].reverse().find(m => m.role === 'user');
                    let preview = 'No preview';
                    if (lastUserMsg?.content) {
                        let clean = lastUserMsg.content;

                        // 1. Remove Repository Structure (up to "User Question:")
                        // The structure is: [Repo]... \n\nUser Question: [Commands]...
                        clean = clean.replace(/^[\s\S]*?User Question:/, '');

                        // 2. Remove "Available Custom Commands" block
                        clean = clean.replace(/Available Custom Commands:[\s\S]*?(?=\n\n|$)/g, '');

                        // 3. Remove "Available Skills" block (if present)
                        clean = clean.replace(/Available Skills \([\s\S]*?(?=\n\n|$)/g, '');
                        clean = clean.replace(/Available Skills:[\s\S]*?(?=\n\n|$)/g, '');

                        // 4. Remove [SYSTEM: ...] instructions at the end
                        clean = clean.replace(/\n\[SYSTEM:[\s\S]*?\]$/g, '');

                        // 5. Clean up code blocks references if they were just context
                        // (Optional, but sometimes context includes file dumps)
                        // For now, let's just trim

                        const text = clean.trim();
                        if (text) {
                            // Take the first 50 chars of what's left
                            preview = text.substring(0, 50).replace(/\n/g, ' ');
                        } else {
                            // If we stripped everything, fallback to raw last line but avoid context
                            const lines = lastUserMsg.content.split('\n');
                            const lastLine = lines[lines.length - 1];
                            if (!lastLine.includes('[SYSTEM:')) {
                                preview = lastLine.substring(0, 50);
                            }
                        }
                    }
                    return {
                        id: f.replace('.json', ''),
                        timestamp: data.timestamp,
                        messageCount: data.history?.length || 0,
                        preview: preview.length >= 50 ? preview + '...' : preview
                    };
                } catch {
                    return null;
                }
            })
            .filter((s): s is { id: string; timestamp: number; messageCount: number; preview: string } => s !== null)
            .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
    }

    public localSessionExists(cwd: string): boolean {
        return this.listLocalSessions(cwd).length > 0;
    }
}
