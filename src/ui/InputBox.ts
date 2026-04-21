/**
 * InputBox - Clean input with live slash-command completion dropdown
 */

import readline from 'readline';
import chalk from 'chalk';

export interface InputBoxOptions {
    showHint?: boolean;
    hint?: string;
}

const COMMANDS: { cmd: string; desc: string }[] = [
    { cmd: '/help',     desc: 'Show all available commands' },
    { cmd: '/model',    desc: 'Switch AI provider & model' },
    { cmd: '/config',   desc: 'Configure API keys & settings' },
    { cmd: '/clear',    desc: 'Clear chat history & context' },
    { cmd: '/sidekick', desc: 'Manage your sidekick companion' },
    { cmd: '/init',     desc: 'Initialize project with .mentis.md' },
    { cmd: '/plan',     desc: 'Switch to PLAN mode' },
    { cmd: '/build',    desc: 'Switch to BUILD mode' },
    { cmd: '/mcp',      desc: 'Manage MCP servers' },
    { cmd: '/add',      desc: 'Add file to context' },
    { cmd: '/drop',     desc: 'Remove file from context' },
    { cmd: '/resume',   desc: 'Resume last session' },
    { cmd: '/search',   desc: 'Search codebase' },
    { cmd: '/run',      desc: 'Run shell command' },
    { cmd: '/commit',   desc: 'Git commit all changes' },
    { cmd: '/skills',   desc: 'Manage agent skills' },
    { cmd: '/commands', desc: 'Manage custom slash commands' },
    { cmd: '/memory',   desc: 'View & manage persistent memory' },
    { cmd: '/exit',     desc: 'Save session & exit' },
];

export class InputBox {
    private history: string[] = [];
    private historySize = 1000;

    constructor(history: string[] = []) {
        this.history = history;
    }

    private getTerminalWidth(): number {
        return process.stdout.columns || 80;
    }

    private createLine(): string {
        return chalk.gray('─'.repeat(this.getTerminalWidth()));
    }

    async prompt(options: InputBoxOptions = {}): Promise<string> {
        const { showHint = false, hint } = options;

        console.log(this.createLine());
        if (showHint && hint) console.log(chalk.dim(`  ${hint}`));

        // Defensive: ensure stdin is in a clean state before readline.
        if (process.stdin.isTTY) { try { process.stdin.setRawMode(false); } catch {} }
        try { process.stdin.resume(); } catch {}

        return new Promise<string>((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: chalk.cyan('> '),
                history: this.history,
                historySize: this.historySize,
            });

            rl.prompt();

            const cleanup = () => {
                rl.close();
                rl.removeAllListeners();
                if (process.stdin.isTTY) { try { process.stdin.setRawMode(false); } catch {} }
            };

            rl.on('line', (line) => {
                console.log(this.createLine());
                cleanup();
                resolve(line);
            });

            rl.on('SIGINT', () => {
                console.log(this.createLine());
                cleanup();
                resolve('/exit');
            });

            rl.on('close', () => {
                if (process.stdin.isTTY) { try { process.stdin.setRawMode(false); } catch {} }
            });
        });
    }

    addToHistory(input: string): void {
        if (!input || input === this.history[0]) return;
        this.history.unshift(input);
        if (this.history.length > this.historySize) {
            this.history = this.history.slice(0, this.historySize);
        }
    }

    getHistory(): string[] { return this.history; }

    public displayFrame(contextInfo?: { messageCount: number; contextPercent: number }): void {
        console.log('');
        if (contextInfo) {
            const { messageCount, contextPercent } = contextInfo;
            const color = contextPercent < 60 ? chalk.green : contextPercent < 80 ? chalk.yellow : chalk.red;
            const bar = this.createProgressBar(contextPercent);
            console.log(chalk.dim(`  ${bar} ${messageCount} msgs ${color(contextPercent + '%')}`));
        }
    }

    public displaySeparator(contextInfo?: { messageCount: number; contextPercent: number }): void {
        this.displayFrame(contextInfo);
    }

    private createProgressBar(percentage: number): string {
        const width = 15;
        const filled = Math.round(percentage / 100 * width);
        const empty = width - filled;
        const color = percentage < 60 ? chalk.green : percentage < 80 ? chalk.yellow : chalk.red;
        return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
    }
}
