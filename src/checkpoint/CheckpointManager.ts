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
}
