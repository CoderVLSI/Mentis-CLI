import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import os from 'os';

export class PersistentShell {
    private process: ChildProcessWithoutNullStreams;
    private buffer: string = '';
    private delimiter: string = 'MENTIS_SHELL_DELIMITER';
    private resolveCallback: ((output: string) => void) | null = null;
    private rejectCallback: ((error: Error) => void) | null = null;

    constructor() {
        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
        const args = os.platform() === 'win32' ? ['-NoLogo', '-NoExit', '-Command', '-'] : [];

        this.process = spawn(shell, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.process.stdout.on('data', (data) => this.handleOutput(data));
        this.process.stderr.on('data', (data) => this.handleOutput(data));

        this.process.on('error', (err) => {
            console.error('Shell process error:', err);
        });

        this.process.on('exit', (code) => {
            if (code !== 0) {
                console.warn(`Shell process exited with code ${code}`);
            }
        });
    }

    private handleOutput(data: Buffer) {
        const chunk = data.toString();
        this.buffer += chunk;

        if (this.buffer.includes(this.delimiter)) {
            const output = this.buffer.replace(this.delimiter, '').trim();
            // Remove the echo command itself if it appears in output (common in some shells)
            // But usually the delimiter is at the end.
            // Let's just resolve.
            if (this.resolveCallback) {
                this.resolveCallback(output);
                this.resolveCallback = null;
                this.rejectCallback = null;
            }
            this.buffer = '';
        }
    }

    public async execute(command: string): Promise<string> {
        if (this.resolveCallback) {
            throw new Error('Shell is busy execution another command.');
        }

        return new Promise((resolve, reject) => {
            this.resolveCallback = resolve;
            this.rejectCallback = reject;
            this.buffer = '';

            // Clean command to avoid newlines messing up
            const cleanCommand = command.replace(/\n/g, '; ');

            // Append delimiter echo
            const fullCommand = `${cleanCommand}; echo "${this.delimiter}"\n`;

            this.process.stdin.write(fullCommand);
        });
    }

    public kill() {
        this.process.kill();
    }
}
