import { Tool } from './Tool';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export class GitStatusTool implements Tool {
    name = 'git_status';
    description = 'Check the status of the git repository.';
    parameters = {
        type: 'object',
        properties: {},
        required: []
    };

    async execute(args: any): Promise<string> {
        try {
            const { stdout } = await execAsync('git status');
            return stdout;
        } catch (error: any) {
            return `Error running git status: ${error.message}`;
        }
    }
}

export class GitDiffTool implements Tool {
    name = 'git_diff';
    description = 'Show changes in the git repository.';
    parameters = {
        type: 'object',
        properties: {
            cached: {
                type: 'boolean',
                description: 'Show cached (staged) changes.'
            }
        },
        required: []
    };

    async execute(args: { cached?: boolean }): Promise<string> {
        try {
            const cmd = args.cached ? 'git diff --cached' : 'git diff';
            const { stdout } = await execAsync(cmd);
            return stdout || 'No changes found.';
        } catch (error: any) {
            return `Error running git diff: ${error.message}`;
        }
    }
}

export class GitCommitTool implements Tool {
    name = 'git_commit';
    description = 'Commit changes to the git repository.';
    parameters = {
        type: 'object',
        properties: {
            message: {
                type: 'string',
                description: 'The commit message.'
            }
        },
        required: ['message']
    };

    async execute(args: { message: string }): Promise<string> {
        try {
            // Escape double quotes in message
            const safeMessage = args.message.replace(/"/g, '\\"');
            const { stdout } = await execAsync(`git commit -m "${safeMessage}"`);
            return stdout;
        } catch (error: any) {
            return `Error running git commit: ${error.message}`;
        }
    }
}

export class GitPushTool implements Tool {
    name = 'git_push';
    description = 'Push changes to the remote repository.';
    parameters = {
        type: 'object',
        properties: {},
        required: []
    };

    async execute(args: any): Promise<string> {
        try {
            const { stdout, stderr } = await execAsync('git push');
            return stdout + (stderr ? `\nStderr: ${stderr}` : '');
        } catch (error: any) {
            return `Error running git push: ${error.message}`;
        }
    }
}

export class GitPullTool implements Tool {
    name = 'git_pull';
    description = 'Pull changes from the remote repository.';
    parameters = {
        type: 'object',
        properties: {},
        required: []
    };

    async execute(args: any): Promise<string> {
        try {
            const { stdout } = await execAsync('git pull');
            return stdout;
        } catch (error: any) {
            return `Error running git pull: ${error.message}`;
        }
    }
}
