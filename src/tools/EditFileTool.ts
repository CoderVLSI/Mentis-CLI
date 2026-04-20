import { Tool } from './Tool';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * EditFileTool - Performs string replacement in files (like Claude's Edit tool)
 *
 * execute() applies the edit AND returns a diff preview. Approval gating is
 * handled by ReplManager before execute() is called (via handleEditApproval),
 * so by the time we get here the user has already consented.
 */
export class EditFileTool implements Tool {
    name = 'edit_file';
    description = 'Make targeted edits to files using exact string replacement. Applies the edit and returns a unified diff.';
    parameters = {
        type: 'object',
        properties: {
            file_path: {
                type: 'string',
                description: 'The path to the file to edit'
            },
            old_string: {
                type: 'string',
                description: 'The exact string to replace. Must match exactly (including whitespace).'
            },
            new_string: {
                type: 'string',
                description: 'The new string to replace old_string with.'
            },
            auto_format: {
                type: 'boolean',
                description: 'Auto-format code after edit (default: false)'
            }
        },
        required: ['file_path', 'old_string', 'new_string']
    };

    /**
     * Apply the edit and return a diff preview.
     * Accepts both snake_case (file_path/old_string/new_string) and camelCase
     * (filePath/oldString/newString) since different models emit different styles.
     */
    async execute(args: any): Promise<string> {
        const file_path  = args.file_path  ?? args.filePath  ?? args.path;
        const old_string = args.old_string ?? args.oldString ?? args.old ?? args.search;
        const new_string = args.new_string ?? args.newString ?? args.new ?? args.replace ?? '';

        if (!file_path || old_string == null) {
            return `Error: edit_file requires file_path, old_string, and new_string.`;
        }

        const filePath = resolve(process.cwd(), file_path);

        if (!existsSync(filePath)) {
            return `Error: File not found: ${file_path}`;
        }

        const originalContent = readFileSync(filePath, 'utf-8');

        if (!originalContent.includes(old_string)) {
            return `Error: old_string not found in ${file_path}. The string must match exactly (including whitespace and indentation).`;
        }

        const occurrences = (originalContent.match(new RegExp(this.escapeRegex(old_string), 'g')) || []).length;

        // Actually write the change (approval already granted upstream)
        const newContent = originalContent.split(old_string).join(new_string);
        try {
            writeFileSync(filePath, newContent, 'utf-8');
        } catch (e: any) {
            return `Error writing file: ${e.message}`;
        }

        const diff = this.generateDiff(originalContent, old_string, new_string, file_path);
        const header = occurrences > 1
            ? `✓ Replaced ${occurrences} occurrences in ${file_path}\n`
            : `✓ Edited ${file_path}\n`;
        return header + diff;
    }

    /**
     * Apply the edit after approval
     * This should be called after user approves the diff
     */
    applyEdit(args: {
        file_path: string;
        old_string: string;
        new_string: string;
    }): { success: boolean; message: string } {
        const filePath = resolve(process.cwd(), args.file_path);

        if (!existsSync(filePath)) {
            return { success: false, message: `File not found: ${args.file_path}` };
        }

        const originalContent = readFileSync(filePath, 'utf-8');

        if (!originalContent.includes(args.old_string)) {
            return { success: false, message: 'old_string not found in file' };
        }

        const newContent = originalContent.replace(args.old_string, args.new_string);

        writeFileSync(filePath, newContent, 'utf-8');

        return {
            success: true,
            message: `Successfully edited ${args.file_path}`
        };
    }

    /**
     * Generate a unified diff preview
     */
    private generateDiff(content: string, oldString: string, newString: string, filePath: string): string {
        const lines = content.split('\n');
        const oldLines = oldString.split('\n');
        const newLines = newString.split('\n');

        // Find the line number where old_string starts
        let startLine = -1;
        for (let i = 0; i <= lines.length - oldLines.length; i++) {
            let match = true;
            for (let j = 0; j < oldLines.length; j++) {
                if (lines[i + j] !== oldLines[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                startLine = i;
                break;
            }
        }

        if (startLine === -1) {
            return 'Error: Could not locate old_string in file';
        }

        // Build unified diff
        let diff = `\n${'─'.repeat(60)}\n`;
        diff += `📝 Edit Preview: ${filePath}\n`;
        diff += `${'─'.repeat(60)}\n`;
        diff += `Line ${startLine + 1}:\n\n`;

        // Show context (2 lines before)
        const contextStart = Math.max(0, startLine - 2);
        if (contextStart < startLine) {
            for (let i = contextStart; i < startLine; i++) {
                diff += `  ${lines[i]}\n`;
            }
        }

        // Show removed lines (red)
        for (const line of oldLines) {
            diff += `\x1b[31m- ${line}\x1b[0m\n`;
        }

        // Show added lines (green)
        for (const line of newLines) {
            diff += `\x1b[32m+ ${line}\x1b[0m\n`;
        }

        // Show context (2 lines after)
        const contextEnd = Math.min(lines.length, startLine + oldLines.length + 2);
        if (startLine + oldLines.length < contextEnd) {
            for (let i = startLine + oldLines.length; i < contextEnd; i++) {
                diff += `  ${lines[i]}\n`;
            }
        }

        diff += `${'─'.repeat(60)}\n`;

        return diff;
    }

    /**
     * Escape special regex characters
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
