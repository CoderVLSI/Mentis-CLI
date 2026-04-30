/**
 * InputBox - Input with live slash-command dropdown (Claude Code style)
 */

import readline from 'readline';
import chalk from 'chalk';
import { COMMAND_LIST } from '../commands/commandList';

export interface InputBoxOptions {
    showHint?: boolean;
    hint?: string;
}

export const COMMANDS = COMMAND_LIST;

const CMD_NAMES = COMMANDS.map(c => c.cmd);

function tabCompleter(line: string): [string[], string] {
    if (line.startsWith('/') && !line.includes(' ')) {
        const hits = CMD_NAMES.filter(c => c.startsWith(line));
        return [hits, line];
    }
    return [[], line];
}

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

        // Try interactive (raw-mode) on any TTY, including Windows Terminal.
        // promptInteractive() falls back internally if setRawMode fails.
        if (process.stdin.isTTY || (process.stdout as any).isTTY) {
            return this.promptInteractive();
        }
        return this.promptFallback();
    }

    /** Raw-mode interactive prompt with live dropdown */
    private async promptInteractive(): Promise<string> {
        return new Promise<string>((resolve) => {
            let buffer = '';
            let dropdown: { cmd: string; desc: string }[] = [];
            let dropdownLines = 0;
            let selIdx = 0;

            // Remove any stale keypress listeners (e.g. leftover ESC handler from handleChat)
            // then put stdin into a known-good state before taking raw mode.
            process.stdin.removeAllListeners('keypress');
            if (process.stdin.isTTY) { try { process.stdin.setRawMode(false); } catch {} }
            try { process.stdin.resume(); } catch {}

            try { process.stdin.setRawMode(true); } catch {
                this.promptFallback().then(resolve);
                return;
            }
            readline.emitKeypressEvents(process.stdin);
            process.stdout.write(chalk.cyan('> '));

            const clearDropdown = () => {
                if (dropdownLines === 0) return;
                // save cursor → jump down → clear each line upward → restore
                process.stdout.write('\x1b[s');
                for (let i = 0; i < dropdownLines; i++) {
                    process.stdout.write('\x1b[1B\x1b[2K');
                }
                process.stdout.write('\x1b[u');
                dropdownLines = 0;
            };

            const drawDropdown = () => {
                clearDropdown();
                if (dropdown.length === 0) return;
                dropdownLines = dropdown.length;
                process.stdout.write('\x1b[s');
                for (let i = 0; i < dropdown.length; i++) {
                    const { cmd, desc } = dropdown[i];
                    const isSelected = i === selIdx;
                    const arrow = isSelected ? chalk.cyan(' ❯ ') : '   ';
                    const cmdStr = isSelected ? chalk.cyan(cmd.padEnd(14)) : chalk.gray(cmd.padEnd(14));
                    const descStr = chalk.dim(desc);
                    process.stdout.write(`\x1b[1B\r${arrow}${cmdStr} ${descStr}\x1b[K`);
                }
                process.stdout.write('\x1b[u');
            };

            const updateDropdown = () => {
                if (buffer.startsWith('/') && !buffer.includes(' ')) {
                    const matches = COMMANDS.filter(c => c.cmd.startsWith(buffer) && c.cmd !== buffer);
                    if (matches.length > 0) {
                        dropdown = matches;
                        selIdx = Math.max(0, Math.min(selIdx, dropdown.length - 1));
                        drawDropdown();
                        return;
                    }
                }
                dropdown = [];
                clearDropdown();
            };

            const finish = (value: string) => {
                clearDropdown();
                process.stdout.write('\n');
                try { process.stdin.setRawMode(false); } catch {}
                process.stdin.removeListener('keypress', onKey);
                console.log(this.createLine());
                if (value) {
                    this.addToHistory(value);
                }
                resolve(value);
            };

            const onKey = (str: string, key: any) => {
                if (!key) return;

                // Ctrl+C
                if (key.ctrl && key.name === 'c') { finish('/exit'); return; }

                // Enter — accept dropdown selection or submit buffer
                if (key.name === 'return' || key.name === 'enter') {
                    const result = dropdown.length > 0 ? dropdown[selIdx].cmd : buffer;
                    clearDropdown();
                    // rewrite line with accepted value so user can see it
                    if (dropdown.length > 0 && result !== buffer) {
                        process.stdout.write('\r\x1b[2K' + chalk.cyan('> ') + result);
                    }
                    finish(result);
                    return;
                }

                // Arrow down
                if (key.name === 'down') {
                    if (dropdown.length > 0) { selIdx = (selIdx + 1) % dropdown.length; drawDropdown(); }
                    return;
                }

                // Arrow up
                if (key.name === 'up') {
                    if (dropdown.length > 0) { selIdx = (selIdx - 1 + dropdown.length) % dropdown.length; drawDropdown(); }
                    return;
                }

                // Tab — accept highlighted dropdown item
                if (key.name === 'tab') {
                    if (dropdown.length > 0) {
                        const selected = dropdown[selIdx].cmd;
                        buffer = selected;
                        process.stdout.write('\r\x1b[2K' + chalk.cyan('> ') + selected);
                        dropdown = [];
                        clearDropdown();
                    }
                    return;
                }

                // Escape — close dropdown
                if (key.name === 'escape') { dropdown = []; clearDropdown(); return; }

                // Backspace
                if (key.name === 'backspace') {
                    if (buffer.length > 0) {
                        buffer = buffer.slice(0, -1);
                        process.stdout.write('\b \b');
                        selIdx = 0;
                        updateDropdown();
                    }
                    return;
                }

                // Printable character
                if (str && !key.ctrl && !key.meta && str.length === 1) {
                    buffer += str;
                    process.stdout.write(str);
                    selIdx = 0;
                    updateDropdown();
                }
            };

            process.stdin.on('keypress', onKey);
        });
    }

    /** Fallback for non-TTY / raw-mode failure */
    private promptFallback(): Promise<string> {
        if (process.stdin.isTTY) { try { process.stdin.setRawMode(false); } catch {} }
        try { process.stdin.resume(); } catch {}
        return new Promise<string>((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin, output: process.stdout,
                prompt: chalk.cyan('> '),
                history: this.history, historySize: this.historySize,
                completer: tabCompleter,
            });
            rl.prompt();
            const cleanup = () => { rl.close(); rl.removeAllListeners(); };
            rl.on('line', (line) => { console.log(this.createLine()); cleanup(); resolve(line); });
            rl.on('SIGINT', () => { console.log(this.createLine()); cleanup(); resolve('/exit'); });
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
