import fs from 'fs-extra';
import path from 'path';

export interface FileContext {
    path: string;
    content: string;
}

export class ContextManager {
    private files: Map<string, string> = new Map();

    public async addFile(filePath: string): Promise<string> {
        try {
            const absolutePath = path.resolve(process.cwd(), filePath);
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            const content = await fs.readFile(absolutePath, 'utf-8');
            this.files.set(absolutePath, content);
            return `Added ${filePath} to context.`;
        } catch (error: any) {
            return `Error adding file: ${error.message}`;
        }
    }

    public removeFile(filePath: string): string {
        const absolutePath = path.resolve(process.cwd(), filePath);
        if (this.files.has(absolutePath)) {
            this.files.delete(absolutePath);
            return `Removed ${filePath} from context.`;
        }
        return `File not in context: ${filePath}`;
    }

    public clear(): void {
        this.files.clear();
    }

    public getContextString(): string {
        if (this.files.size === 0) return '';

        let context = 'Current File Context:\n\n';
        for (const [filePath, content] of this.files.entries()) {
            context += `--- File: ${path.basename(filePath)} ---\n${content}\n\n`;
        }
        return context;
    }

    public getFiles(): string[] {
        return Array.from(this.files.keys());
    }
}
