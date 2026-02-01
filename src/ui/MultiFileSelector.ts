import inquirer from 'inquirer';
import chalk from 'chalk';
import { statSync } from 'fs';
import { join } from 'path';

export interface FileSelection {
    path: string;
    selected: boolean;
    size?: string;
    type?: string;
}

/**
 * Multi-file selector for read approval
 * Shows interactive checklist when AI wants to read multiple files
 */
export class MultiFileSelector {
    /**
     * Show file selection UI for read operations
     * Returns the list of approved files
     */
    static async selectFiles(filePaths: string[], message: string = 'Select files to read:'): Promise<string[]> {
        if (filePaths.length === 0) {
            return [];
        }

        if (filePaths.length === 1) {
            // Single file - just show what's being read
            console.log(chalk.dim(`📖 Reading: ${filePaths[0]}`));
            return filePaths;
        }

        // Build file choices with metadata
        const choices = filePaths.map(path => {
            let metadata = '';
            try {
                const stats = statSync(path);
                const size = this.formatFileSize(stats.size);
                metadata = chalk.dim(` (${size})`);
            } catch {
                // File might not exist or be inaccessible
            }

            return {
                name: path + metadata,
                value: path,
                checked: true, // Default to checked
                short: path
            };
        });

        console.log('');
        console.log(chalk.cyan(`📖 AI wants to read ${filePaths.length} files:`));
        console.log('');

        const { selectedFiles } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'selectedFiles',
                message: message,
                choices: choices,
                pageSize: 15,
                validate: (answer: string[]) => {
                    if (answer.length === 0) {
                        return 'You must select at least one file, or press Ctrl+C to cancel.';
                    }
                    return true;
                }
            }
        ]);

        // Show what was selected
        if (selectedFiles.length < filePaths.length) {
            console.log(chalk.dim(`  Reading ${selectedFiles.length} of ${filePaths.length} files`));
        }

        return selectedFiles;
    }

    /**
     * Show a simple confirmation for single file reads (optional)
     */
    static async confirmRead(filePath: string, preview?: string): Promise<boolean> {
        let message = chalk.cyan(`📖 Read file: ${filePath}?`);

        if (preview) {
            const lines = preview.split('\n');
            const previewLines = lines.slice(0, 5);
            console.log('');
            console.log(chalk.gray('─'.repeat(60)));
            console.log(message);
            console.log(chalk.gray('─'.repeat(60)));
            console.log(chalk.dim('Preview:'));
            for (const line of previewLines) {
                console.log(chalk.dim('  ' + line));
            }
            if (lines.length > 5) {
                console.log(chalk.dim('  ...'));
            }
            console.log(chalk.gray('─'.repeat(60)));
        } else {
            console.log(message);
        }

        const { confirmed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: 'Continue?',
                default: true
            }
        ]);

        return confirmed;
    }

    /**
     * Format file size in human-readable format
     */
    private static formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Show progress when reading multiple files
     */
    static showReadProgress(current: number, total: number, filePath: string): void {
        const progress = chalk.dim(`[${current}/${total}]`);
        console.log(chalk.dim(`  ${progress} Reading: ${filePath}`));
    }
}
