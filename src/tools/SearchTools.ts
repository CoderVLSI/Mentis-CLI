import { Tool } from './Tool';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);

export class SearchFileTool implements Tool {
    name = 'search_files';
    description = 'Search for a string pattern in files within the current directory recursively.';
    parameters = {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The string or regular expression to search for.'
            },
            path: {
                type: 'string',
                description: 'Optional path to limit search (default: .)'
            }
        },
        required: ['query']
    };

    async execute(args: { query: string, path?: string }): Promise<string> {
        try {
            const searchPath = args.path || '.';
            // Use git grep if available as it respects .gitignore, otherwise fallback to grep or findstr
            // For simplicity/cross-platform in this environment, let's try a heuristic:
            // win32 usually has findstr, but git grep is better if installed. 
            // We'll assume standard 'grep -r' works in many envs or user has git bash.
            // Actually, safer to use 'git grep -n "query"' if inside a repo.

            const command = `git grep -n "${args.query}" ${searchPath}`;
            const { stdout } = await execAsync(command);
            return stdout || 'No matches found.';
        } catch (error: any) {
            // grep returns exit code 1 if not found, distinct from error
            if (error.code === 1) return 'No matches found.';
            return `Error searching: ${error.message}`;
        }
    }
}

export class RunShellTool implements Tool {
    name = 'run_shell';
    description = 'Execute a shell command. Use this for running tests, build scripts, or git commands.';
    parameters = {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: 'The shell command to execute.'
            }
        },
        required: ['command']
    };

    async execute(args: { command: string }): Promise<string> {
        // Safety: We might want to block dangerous commands, but user approval is better.
        // For now, relies on the ReplManager's safety/approval loop if we add it for this tool too.
        // Or we just allow it since it's a CLI tool for devs.
        try {
            const { stdout, stderr } = await execAsync(args.command);
            let result = '';
            if (stdout) result += `STDOUT:\n${stdout}\n`;
            if (stderr) result += `STDERR:\n${stderr}\n`;
            return result || 'Command executed with no output.';
        } catch (error: any) {
            return `Error executing command: ${error.message}\nSTDOUT: ${error.stdout}\nSTDERR: ${error.stderr}`;
        }
    }
}
