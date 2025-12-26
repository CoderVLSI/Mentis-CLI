/**
 * SlashCommandTool - Tool for model-invoked custom command execution
 * The model can call this tool when it determines a custom command should be run
 */

import { Tool } from '../tools/Tool';
import { CommandManager } from './CommandManager';
import { Command } from './Command';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SlashCommandArgs {
    name: string;
    arguments?: string[];
}

export class SlashCommandTool implements Tool {
    name = 'slash_command';
    description = 'Execute a custom slash command. Available commands can be seen in /help. Example: slash_command({ name: "review", arguments: ["src/file.ts"] })';
    parameters = {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'The name of the custom command to execute'
            },
            arguments: {
                type: 'array',
                items: { type: 'string' },
                description: 'Arguments to pass to the command'
            }
        },
        required: ['name']
    };

    private commandManager: CommandManager;

    constructor(commandManager: CommandManager) {
        this.commandManager = commandManager;
    }

    async execute(args: SlashCommandArgs): Promise<string> {
        const { name, arguments: cmdArgs = [] } = args;

        if (!name) {
            return 'Error: Command name is required';
        }

        const command = this.commandManager.getCommand(name);
        if (!command) {
            const availableCommands = this.commandManager.getAllCommands().map(c => c.name).join(', ');
            return `Error: Command "${name}" not found. Available commands: ${availableCommands || 'none'}`;
        }

        try {
            // Parse command and handle substitutions
            const parsed = await this.commandManager.parseCommand(command, cmdArgs);
            let content = parsed.content;

            // Execute bash commands and collect results
            const bashResults: string[] = [];
            for (const bashCmd of parsed.bashCommands) {
                try {
                    const result = await execAsync(bashCmd);
                    bashResults.push(`${bashCmd}\n${result.stdout}`);
                } catch (error: any) {
                    bashResults.push(`${bashCmd}\nError: ${error.message}`);
                }
            }

            // Substitute bash outputs into content
            let bashIndex = 0;
            content = content.replace(/\[BASH_OUTPUT\]/g, () => {
                return bashResults[bashIndex++] || '';
            });

            // Read file references
            const fileContents: string[] = [];
            for (const filePath of parsed.fileReferences) {
                try {
                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    fileContents.push(`\n=== File: ${filePath} ===\n${fileContent}\n=== End of ${filePath} ===\n`);
                } catch (error: any) {
                    fileContents.push(`\n=== File: ${filePath} ===\nError: ${error.message}\n=== End of ${filePath} ===\n`);
                }
            }

            // Substitute file references
            let fileIndex = 0;
            content = content.replace(/@[^\s]+/g, () => {
                return fileContents[fileIndex++] || '';
            });

            return `# Executing: /${name}${cmdArgs.length ? ' ' + cmdArgs.join(' ') : ''}\n\n${content}`;
        } catch (error: any) {
            return `Error executing command "${name}": ${error.message}`;
        }
    }
}

/**
 * ListCommandsTool - Tool for listing custom commands
 */
export class ListCommandsTool implements Tool {
    name = 'list_commands';
    description = 'List all available custom slash commands with their descriptions';
    parameters = {
        type: 'object',
        properties: {},
        required: []
    };

    private commandManager: CommandManager;

    constructor(commandManager: CommandManager) {
        this.commandManager = commandManager;
    }

    async execute(): Promise<string> {
        const commands = this.commandManager.getAllCommands();

        if (commands.length === 0) {
            return 'No custom commands available. Add commands to ~/.mentis/commands/ or .mentis/commands/';
        }

        let response = `# Custom Commands (${commands.length})\n\n`;

        // Group by namespace
        const grouped = new Map<string, Command[]>();
        for (const cmd of commands) {
            const ns = cmd.description.match(/\(([^)]+)\)/)?.[1] || cmd.type;
            if (!grouped.has(ns)) {
                grouped.set(ns, []);
            }
            grouped.get(ns)!.push(cmd);
        }

        for (const [namespace, cmds] of grouped) {
            response += `## ${namespace}\n\n`;
            for (const cmd of cmds) {
                const params = cmd.frontmatter['argument-hint'] ? ` ${cmd.frontmatter['argument-hint']}` : '';
                response += `**/${cmd.name}${params}**\n`;
                response += `${cmd.description}\n\n`;
            }
        }

        return response;
    }
}
