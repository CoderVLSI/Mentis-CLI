import fg from 'fast-glob';
import path from 'path';
import { Tool } from './Tool';

export class GlobTool implements Tool {
    name = 'glob_files';
    description = 'Find files matching a pattern (e.g. src/**/*.ts).';
    parameters = {
        type: 'object',
        properties: {
            pattern: {
                type: 'string',
                description: 'The glob pattern to search for'
            },
            path: {
                type: 'string',
                description: 'Root directory to start search from (default: .)'
            }
        },
        required: ['pattern']
    };

    async execute(args: { pattern: string, path?: string }): Promise<string> {
        try {
            const cwd = args.path ? path.resolve(args.path) : process.cwd();
            // fast-glob returns only forward slashes.
            const entries = await fg(args.pattern, { cwd, absolute: false });

            return entries.length > 0 ? entries.join('\n') : 'No files found matching pattern.';
        } catch (error: any) {
            return `Error in glob search: ${error.message}`;
        }
    }
}
