import chalk from 'chalk';
import { diffLines } from 'diff';

/**
 * Visual diff viewer component
 * Shows file changes with color coding like git diff
 */
export class DiffViewer {
    /**
     * Display a unified diff between old and new content
     */
    static showDiff(filePath: string, oldContent: string, newContent: string, contextLines: number = 3): void {
        const diff = diffLines(oldContent, newContent);

        console.log('');
        console.log(chalk.gray('─'.repeat(60)));
        console.log(chalk.cyan(`📝 Diff: ${filePath}`));
        console.log(chalk.gray('─'.repeat(60)));
        console.log('');

        let unchangedCount = 0;
        const unchangedBuffer: string[] = [];

        const flushUnchanged = () => {
            if (unchangedBuffer.length > 0) {
                // Show context lines
                const contextStart = Math.max(0, unchangedBuffer.length - contextLines);
                for (let i = contextStart; i < unchangedBuffer.length; i++) {
                    console.log(chalk.dim('  ' + unchangedBuffer[i].replace(/\n/g, '')));
                }
                unchangedBuffer.length = 0;
                unchangedCount = 0;
            }
        };

        let hasChanges = false;
        let additions = 0;
        let deletions = 0;

        for (const part of diff) {
            const lines = part.value.split('\n');
            // Remove empty last line if exists
            if (lines[lines.length - 1] === '') {
                lines.pop();
            }

            for (const line of lines) {
                if (part.added) {
                    flushUnchanged();
                    console.log(chalk.green('+ ' + line));
                    additions++;
                    hasChanges = true;
                } else if (part.removed) {
                    flushUnchanged();
                    console.log(chalk.red('- ' + line));
                    deletions++;
                    hasChanges = true;
                } else {
                    unchangedBuffer.push(line);
                    unchangedCount++;
                }
            }
        }

        flushUnchanged();

        console.log('');
        console.log(chalk.gray('─'.repeat(60)));

        if (hasChanges) {
            console.log(chalk.green(`+ ${additions} additions`) + chalk.dim(' | ') + chalk.red(`- ${deletions} deletions`));
        } else {
            console.log(chalk.dim('No changes'));
        }

        console.log(chalk.gray('─'.repeat(60)));
        console.log('');
    }

    /**
     * Display a simple edit preview (for EditFileTool)
     */
    static showEditPreview(filePath: string, oldString: string, newString: string, lineNumber: number): void {
        console.log('');
        console.log(chalk.gray('─'.repeat(60)));
        console.log(chalk.cyan(`📝 Edit Preview: ${filePath}`));
        console.log(chalk.gray('─'.repeat(60)));
        console.log(chalk.dim(`Line ${lineNumber}:`));
        console.log('');

        const oldLines = oldString.split('\n');
        const newLines = newString.split('\n');

        // Show removed lines in red
        for (const line of oldLines) {
            console.log(chalk.red('- ' + line));
        }

        // Show added lines in green
        for (const line of newLines) {
            console.log(chalk.green('+ ' + line));
        }

        console.log('');
        console.log(chalk.gray('─'.repeat(60)));
        console.log('');
    }

    /**
     * Display approval prompt
     */
    static showApprovalPrompt(filePath: string, operation: 'write' | 'edit'): void {
        const icon = operation === 'write' ? '📄' : '✏️';
        console.log(chalk.yellow(`${icon} Approve ${operation} to ${filePath}?`));
        console.log(chalk.dim('  [y] Yes  [n] No  [e] Edit'));
    }
}
