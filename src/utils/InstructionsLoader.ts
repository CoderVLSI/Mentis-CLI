/**
 * InstructionsLoader - Auto-loads .mentis.md project instructions
 *
 * Mirrors Claude Code's CLAUDE.md behaviour:
 *   1. Walks up from cwd to home directory looking for .mentis.md files
 *   2. Also checks ~/.mentis/MENTIS.md for global user instructions
 *   3. All found files are concatenated (outermost first, project last)
 *      so project-level instructions override/append to global ones.
 *
 * The resulting string is injected into the system prompt at session start
 * so the AI always has project context without the user needing to /add files.
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const INSTRUCTIONS_FILENAME = '.mentis.md';
const GLOBAL_INSTRUCTIONS_PATH = path.join(os.homedir(), '.mentis', 'MENTIS.md');

export class InstructionsLoader {
    private cwd: string;

    constructor(cwd: string = process.cwd()) {
        this.cwd = cwd;
    }

    /**
     * Load and concatenate all applicable .mentis.md files.
     * Returns an empty string if none are found.
     */
    load(): string {
        const sections: string[] = [];

        // 1. Global user instructions (~/.mentis/MENTIS.md)
        if (fs.existsSync(GLOBAL_INSTRUCTIONS_PATH)) {
            const content = this.readFile(GLOBAL_INSTRUCTIONS_PATH);
            if (content) {
                sections.push(this.wrap(content, 'Global Instructions', GLOBAL_INSTRUCTIONS_PATH));
            }
        }

        // 2. Walk from home dir down to cwd, collecting .mentis.md files
        //    (outermost ancestor first, project-level last — so project wins)
        const homeDir = os.homedir();
        const chain = this.buildPathChain(this.cwd, homeDir);

        for (const dir of chain) {
            const filePath = path.join(dir, INSTRUCTIONS_FILENAME);
            if (fs.existsSync(filePath)) {
                const content = this.readFile(filePath);
                if (content) {
                    const label = dir === this.cwd ? 'Project Instructions' : `Instructions (${dir})`;
                    sections.push(this.wrap(content, label, filePath));
                }
            }
        }

        return sections.join('\n\n');
    }

    /**
     * Returns true if any .mentis.md was found for this project.
     * Useful for suggesting /init to new users.
     */
    hasInstructions(): boolean {
        return this.load().length > 0;
    }

    /**
     * Build an ordered list of directories from the outermost ancestor
     * (just below home) down to cwd.
     */
    private buildPathChain(cwd: string, stopAt: string): string[] {
        const chain: string[] = [];
        let current = path.resolve(cwd);
        const stop = path.resolve(stopAt);

        while (true) {
            chain.unshift(current);
            const parent = path.dirname(current);
            if (current === stop || current === parent) break;
            current = parent;
        }

        return chain;
    }

    private readFile(filePath: string): string {
        try {
            return fs.readFileSync(filePath, 'utf-8').trim();
        } catch {
            return '';
        }
    }

    private wrap(content: string, label: string, filePath: string): string {
        return [
            `<!-- ${label} loaded from: ${filePath} -->`,
            content,
        ].join('\n');
    }
}
