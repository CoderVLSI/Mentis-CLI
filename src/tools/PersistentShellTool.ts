import { Tool } from './Tool';
import { PersistentShell } from '../repl/PersistentShell';

export class PersistentShellTool implements Tool {
    name = 'run_shell';
    description = 'Execute a shell command in a persistent session. Use this for running tests, build scripts, or git commands. State (env vars, cwd) is preserved.';
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

    private shell: PersistentShell;

    constructor(shell: PersistentShell) {
        this.shell = shell;
    }

    async execute(args: { command: string }): Promise<string> {
        try {
            const output = await this.shell.execute(args.command);
            return output || 'Command executed with no output.';
        } catch (error: any) {
            return `Error executing command: ${error.message}`;
        }
    }
}
