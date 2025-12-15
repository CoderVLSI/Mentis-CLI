import fs from 'fs-extra';
import path from 'path';
import { Tool } from './Tool';

export class EditTool implements Tool {
    name = 'edit_file';
    description = 'Replace a specific string of text with new text in a file.';
    parameters = {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'The path to the file to edit'
            },
            target: {
                type: 'string',
                description: 'The exact string to replace'
            },
            replacement: {
                type: 'string',
                description: 'The new string to replace it with'
            }
        },
        required: ['filePath', 'target', 'replacement']
    };

    async execute(args: { filePath: string, target: string, replacement: string }): Promise<string> {
        try {
            const absolutePath = path.resolve(args.filePath);
            if (!await fs.pathExists(absolutePath)) {
                return `Error: File not found at ${args.filePath}`;
            }

            const content = await fs.readFile(absolutePath, 'utf-8');

            if (!content.includes(args.target)) {
                return `Error: Target string not found in file.`;
            }

            // Check for multiple occurrences
            const regex = new RegExp(args.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            const matchCount = (content.match(regex) || []).length;

            if (matchCount > 1) {
                return `Error: Target string found ${matchCount} times. content must be unique to avoid ambiguous replacements.`;
            }

            const newContent = content.replace(args.target, args.replacement);
            await fs.writeFile(absolutePath, newContent, 'utf-8');

            return `Successfully replaced target in ${args.filePath}`;
        } catch (error: any) {
            return `Error editing file: ${error.message}`;
        }
    }
}
