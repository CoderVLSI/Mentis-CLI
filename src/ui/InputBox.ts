/**
 * InputBox - Simple clean input with top line only
 * Bottom line appears after submission (cross-platform compatible)
 */

import readline from 'readline';
import chalk from 'chalk';

export interface InputBoxOptions {
    placeholder?: string;
    showHint?: boolean;
    hint?: string;
}

export class InputBox {
    private history: string[] = [];
    private historySize: number = 1000;

    constructor(history: string[] = []) {
        this.history = history;
    }

    /**
     * Get terminal width
     */
    private getTerminalWidth(): number {
        return process.stdout.columns || 80;
    }

    /**
     * Create horizontal line
     */
    private createLine(): string {
        const width = this.getTerminalWidth();
        return chalk.gray('─'.repeat(width));
    }

    /**
     * Get user input with horizontal lines around it
     */
    async prompt(options: InputBoxOptions = {}): Promise<string> {
        const { showHint = false, hint } = options;

        // Display top horizontal line
        console.log(this.createLine());

        // Display hint if provided
        if (showHint && hint) {
            console.log(chalk.dim(`  ${hint}`));
        }

        // Defensive: reset stdin to a known-good state before taking input.
        // Prevents freeze when a previous code path left stdin paused, in raw
        // mode, or with leaked keypress listeners.
        if (process.stdin.isTTY) {
            try { process.stdin.setRawMode(false); } catch {}
        }
        try { process.stdin.resume(); } catch {}

        return new Promise<string>((resolve) => {
            // Create readline with simple prompt
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: chalk.cyan('> '),
                history: this.history,
                historySize: this.historySize,
                completer: this.completer.bind(this)
            });

            rl.prompt();

            const cleanup = () => {
                rl.close();
                rl.removeAllListeners();
                // Explicitly ensure raw mode is off to prevent terminal freeze
                if (process.stdin.isTTY) {
                    process.stdin.setRawMode(false);
                }
            };

            rl.on('line', (line) => {
                // Display bottom horizontal line after input
                console.log(this.createLine());
                cleanup();
                resolve(line);
            });

            // Handle Ctrl+C
            rl.on('SIGINT', () => {
                console.log(this.createLine());
                cleanup();
                resolve('/exit');
            });

            // Handle stream errors or unexpected close
            rl.on('close', () => {
                // Should already be cleaned up, but safe to ensure
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
            });
        });
    }

    /**
     * Tab completer — filters slash commands by prefix.
     * Tip: type "/" and press Enter to open the interactive picker.
     */
    private completer(line: string) {
        const commands = [
            '/help', '/model', '/config', '/clear', '/sidekick',
            '/init', '/plan', '/build', '/mcp', '/add', '/drop',
            '/resume', '/search', '/run', '/commit', '/skills',
            '/commands', '/exit',
        ];

        if (!line.startsWith('/')) return [[], line];
        const hits = commands.filter(c => c.startsWith(line));
        return [hits.length ? hits : commands, line];
    }

    /**
     * Add input to history
     */
    addToHistory(input: string): void {
        if (!input || input === this.history[0]) return;
        this.history.unshift(input);
        if (this.history.length > this.historySize) {
            this.history = this.history.slice(0, this.historySize);
        }
    }

    /**
     * Get current history
     */
    getHistory(): string[] {
        return this.history;
    }

    /**
     * Display separator and context info before input
     */
    public displayFrame(contextInfo?: { messageCount: number; contextPercent: number }): void {
        console.log('');

        // Context bar with message count and percentage
        if (contextInfo) {
            const { messageCount, contextPercent } = contextInfo;
            const color = contextPercent < 60 ? chalk.green : contextPercent < 80 ? chalk.yellow : chalk.red;
            const bar = this.createProgressBar(contextPercent);
            console.log(chalk.dim(`  ${bar} ${messageCount} msgs ${color(contextPercent + '%')}`));
        }
    }

    /**
     * Display separator (alias for displayFrame)
     */
    public displaySeparator(contextInfo?: { messageCount: number; contextPercent: number }): void {
        this.displayFrame(contextInfo);
    }

    /**
     * Create a visual progress bar
     */
    private createProgressBar(percentage: number): string {
        const width = 15;
        const filled = Math.round(percentage / 100 * width);
        const empty = width - filled;
        const color = percentage < 60 ? chalk.green : percentage < 80 ? chalk.yellow : chalk.red;
        return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
    }
}
