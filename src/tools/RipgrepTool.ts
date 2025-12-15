import { Tool } from './Tool';
import { spawn } from 'child_process';
import path from 'path';

// Try to find the bundled rg binary from vscode-ripgrep
let rgPath: string = 'rg'; // Default to system path
try {
    const vscodeRg = require('vscode-ripgrep');
    if (vscodeRg.rgPath) {
        rgPath = vscodeRg.rgPath;
    }
} catch (e) {
    // vscode-ripgrep not found, rely on system rg
}

export class RipgrepTool implements Tool {
    name = 'ripgrep_search';
    description = 'Perform a fast regex search across files using ripgrep (rg).';
    parameters = {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Regex pattern to search for.'
            },
            path: {
                type: 'string',
                description: 'Directory or file to search in. Defaults to current directory.'
            },
            globs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Glob patterns to include/exclude (e.g. ["!node_modules", "*.ts"]).'
            },
            caseSensitive: {
                type: 'boolean',
                description: 'Whether to match case sensitively. Default false (ignore case).'
            }
        },
        required: ['query']
    };

    async execute(args: { query: string, path?: string, globs?: string[], caseSensitive?: boolean }): Promise<string> {
        return new Promise((resolve) => {
            const searchPath = args.path || '.';
            const rgArgs = ['--prop-bounds', '--json']; // Force JSON output for easier parsing if needed, or just normal text
            // Let's use standard output for readability by LLM, simplified
            // Actually, simple grep-like output is better.

            const cmdArgs = [args.query, searchPath];

            if (!args.caseSensitive) {
                cmdArgs.unshift('-i');
            }

            if (args.globs) {
                args.globs.forEach(g => {
                    cmdArgs.unshift('-g', g);
                });
            }

            // Line numbers
            cmdArgs.unshift('-n');
            // Headers for file names
            cmdArgs.unshift('--heading');
            // Color 'never'
            cmdArgs.unshift('--color', 'never');

            console.log(`[Ripgrep] Execution: ${rgPath} ${cmdArgs.join(' ')}`);

            const rg = spawn(rgPath, cmdArgs);

            let stdout = '';
            let stderr = '';

            rg.stdout.on('data', (data) => stdout += data);
            rg.stderr.on('data', (data) => stderr += data);

            rg.on('close', (code) => {
                if (code === 0) {
                    // Truncate if too long?
                    if (stdout.length > 50000) {
                        resolve(stdout.substring(0, 50000) + '\n...[Truncated]');
                    } else {
                        resolve(stdout || 'No matches found.');
                    }
                } else if (code === 1) {
                    resolve('No matches found.');
                } else {
                    resolve(`Ripgrep failed (code ${code}): ${stderr}`);
                }
            });

            rg.on('error', (err) => {
                resolve(`Failed to spawn ripgrep: ${err.message}`);
            });
        });
    }
}
