import { Tool } from './Tool';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * EditFileTool - Performs string replacement in files (like Claude's Edit tool)
 * Returns a unified diff preview instead of writing immediately
 */
export class EditFileTool implements Tool {
    name = 'edit_file';
    description = 'Make targeted edits to files using string replacement. Returns diff preview. Requires approval before writing.';
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
     * Execute the edit and return a diff preview
     * Note: This does NOT write the file - it returns what WOULD change
     * The caller (ReplManager) should handle approval before calling applyEdit()
     */
    async execute(args: {
        file_path: string;
        old_string: string;
        new_string: string;
        auto_format?: boolean;
    }): Promise<string> {
        const filePath = resolve(process.cwd(), args.file_path);

        if (!existsSync(filePath)) {
            return `Error: File not found: ${args.file_path}`;
        }

        const originalContent = readFileSync(filePath, 'utf-8');

        if (!originalContent.includes(args.old_string)) {
            return `Error: old_string not found in file. The string must match exactly (including whitespace and indentation).`;
        }

        // Count occurrences
        const occurrences = (originalContent.match(new RegExp(this.escapeRegex(args.old_string), 'g')) || []).length;

        if (occurrences > 1) {
            return `Warning: old_string found ${occurrences} times. All occurrences will be replaced.\n\n${this.generateDiff(originalContent, args.old_string, args.new_string, args.file_path)}`;
        }

        // Generate and return diff
        return this.generateDiff(originalContent, args.old_string, args.new_string, args.file_path);
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
