import fs from 'fs-extra';
import path from 'path';
import { Tool } from './Tool';

export class WriteFileTool implements Tool {
    name = 'write_file';
    description = 'Write content to a file. Overwrites if exists. Creates directories if needed.';
    parameters = {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'The path to the file to write',
            },
            content: {
                type: 'string',
                description: 'The content to write to the file',
            },
        },
        required: ['filePath', 'content'],
    };

    async execute(args: { filePath: string; content: string }): Promise<string> {
        try {
            const absolutePath = path.resolve(args.filePath);
            await fs.ensureDir(path.dirname(absolutePath));
            await fs.writeFile(absolutePath, args.content, 'utf-8');
            return `Successfully wrote to ${args.filePath}`;
        } catch (error: any) {
            return `Error writing file: ${error.message}`;
        }
    }
}

export class ReadFileTool implements Tool {
    name = 'read_file';
    description = 'Read content from a file.';
    parameters = {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'The path to the file to read',
            },
        },
        required: ['filePath'],
    };

    async execute(args: { filePath: string }): Promise<string> {
        try {
            const absolutePath = path.resolve(args.filePath);
            if (!await fs.pathExists(absolutePath)) {
                return `Error: File not found at ${args.filePath}`;
            }
            const content = await fs.readFile(absolutePath, 'utf-8');
            return content;
        } catch (error: any) {
            return `Error reading file: ${error.message}`;
        }
    }
}

export class ListDirTool implements Tool {
    name = 'list_dir';
    description = 'List files and directories in a path.';
    parameters = {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'The directory path to list',
            },
        },
        required: ['path'],
    };

    async execute(args: { path: string }): Promise<string> {
        try {
            const targetPath = path.resolve(args.path);
            if (!await fs.pathExists(targetPath)) {
                return `Error: Directory not found at ${args.path}`;
            }
            const files = await fs.readdir(targetPath);
            return files.join('\n');
        } catch (error: any) {
            return `Error listing directory: ${error.message}`;
        }
    }
}
