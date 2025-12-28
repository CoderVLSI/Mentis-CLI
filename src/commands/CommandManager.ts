/**
 * CommandManager - Discover, parse, and execute custom slash commands
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { glob } from 'fast-glob';
import YAML from 'yaml';
import {
    Command,
    CommandFrontmatter,
    CommandExecutionContext,
    ParsedCommand
} from './Command';

export class CommandManager {
    private commands: Map<string, Command> = new Map();
    private personalCommandsDir: string;
    private projectCommandsDir: string;

    constructor(cwd: string = process.cwd()) {
        this.personalCommandsDir = path.join(os.homedir(), '.mentis', 'commands');
        this.projectCommandsDir = path.join(cwd, '.mentis', 'commands');
    }

    /**
     * Discover all commands from configured directories
     */
    async discoverCommands(): Promise<Command[]> {
        const discovered: Command[] = [];

        // Personal commands
        try {
            discovered.push(...await this.discoverCommandsInDirectory(this.personalCommandsDir, 'personal'));
        } catch (error: any) {
            console.warn(`Warning: Failed to load personal commands from ${this.personalCommandsDir}: ${error.message}`);
        }

        // Project commands
        try {
            discovered.push(...await this.discoverCommandsInDirectory(this.projectCommandsDir, 'project'));
        } catch (error: any) {
            console.warn(`Warning: Failed to load project commands from ${this.projectCommandsDir}: ${error.message}`);
        }

        // Store commands in map (project commands override personal)
        for (const command of discovered) {
            this.commands.set(command.name, command);
        }

        return Array.from(this.commands.values());
    }

    /**
     * Discover commands in a specific directory
     */
    private async discoverCommandsInDirectory(dir: string, type: 'personal' | 'project'): Promise<Command[]> {
        if (!fs.existsSync(dir)) {
            return [];
        }

        const commands: Command[] = [];

        try {
            // Find all .md files in subdirectories
            const commandFiles = await glob('**/*.md', {
                cwd: dir,
                absolute: true,
                onlyFiles: true
            });

            for (const commandFile of commandFiles) {
                const command = await this.parseCommandFile(commandFile, type);
                if (command) {
                    commands.push(command);
                }
            }
        } catch (error: any) {
            console.error(`Error discovering commands in ${dir}: ${error.message}`);
        }

        return commands;
    }

    /**
     * Parse a command file
     */
    private async parseCommandFile(commandPath: string, type: 'personal' | 'project'): Promise<Command | null> {
        try {
            const content = fs.readFileSync(commandPath, 'utf-8');
            const frontmatter = this.extractFrontmatter(content);
            const commandName = this.getCommandName(commandPath, type);

            if (!commandName) {
                console.warn(`Warning: Invalid command name in ${commandPath} (skipping)`);
                return null;
            }

            // Get namespace (subdirectory)
            const relativePath = path.relative(type === 'personal' ? this.personalCommandsDir : this.projectCommandsDir, commandPath);
            const namespace = path.dirname(relativePath) !== '.' ? path.dirname(relativePath) : '';

            const description = frontmatter.description || this.extractFirstLine(content);

            const command: Command = {
                name: commandName,
                type,
                path: commandPath,
                directory: path.dirname(commandPath),
                frontmatter,
                content: content,
                description: namespace ? `${description} (${type}:${namespace})` : description,
                hasParameters: content.includes('$1') || content.includes('$ARGUMENTS')
            };

            return command;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.warn(`Warning: Command file not found: ${commandPath}`);
            } else if (error.code === 'EACCES') {
                console.warn(`Warning: Permission denied reading command: ${commandPath}`);
            } else {
                console.error(`Error parsing command ${commandPath}: ${error.message}`);
            }
            return null;
        }
    }

    /**
     * Get command name from file path
     */
    private getCommandName(commandPath: string, type: 'personal' | 'project'): string | null {
        const relativePath = path.relative(type === 'personal' ? this.personalCommandsDir : this.projectCommandsDir, commandPath);
        const nameWithExt = path.basename(relativePath); // e.g., "review.md"
        const name = nameWithExt.replace(/\.md$/, ''); // e.g., "review"

        if (!name || name.startsWith('.')) {
            return null;
        }

        return name;
    }

    /**
     * Extract YAML frontmatter from markdown content
     */
    private extractFrontmatter(content: string): CommandFrontmatter {
        const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
        const match = content.match(frontmatterRegex);

        if (!match) {
            return {};
        }

        try {
            const parsed = YAML.parse(match[1]) as CommandFrontmatter;
            return parsed;
        } catch (error) {
            return {};
        }
    }

    /**
     * Extract first line of content as description
     */
    private extractFirstLine(content: string): string {
        // Remove frontmatter
        const withoutFrontmatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');

        // Get first non-empty line
        const lines = withoutFrontmatter.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                return trimmed;
            }
        }

        return 'No description';
    }

    /**
     * Get command by name
     */
    getCommand(name: string): Command | undefined {
        return this.commands.get(name);
    }

    /**
     * Get all commands
     */
    getAllCommands(): Command[] {
        return Array.from(this.commands.values());
    }

    /**
     * Get commands context for system prompt injection
     */
    getCommandsContext(): string {
        const commands = this.getAllCommands();

        if (commands.length === 0) {
            return '';
        }

        const context = commands.map(cmd => {
            let line = `/${cmd.name}`;
            if (cmd.frontmatter['argument-hint']) {
                line += ` ${cmd.frontmatter['argument-hint']}`;
            }
            line += `: ${cmd.description.replace(/\s*\([^)]+\)/, '')}`;
            return line;
        }).join('\n');

        return `Available Custom Commands:\n${context}`;
    }

    /**
     * Parse command content and execute substitutions
     */
    async parseCommand(command: Command, args: string[]): Promise<ParsedCommand> {
        let content = command.content;
        const bashCommands: string[] = [];
        const fileReferences: string[] = [];

        // Remove frontmatter from content
        content = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');

        // Substitute $1, $2, etc.
        content = this.substitutePositionalArgs(content, args);

        // Substitute $ARGUMENTS
        content = this.substituteAllArgs(content, args);

        // Extract and collect bash commands (!`cmd`)
        const bashRegex = /!`([^`]+)`/g;
        let bashMatch;
        while ((bashMatch = bashRegex.exec(content)) !== null) {
            const bashCommand = bashMatch[1].trim();
            if (bashCommand) {
                bashCommands.push(bashCommand);
            }
        }

        // Remove bash command markers
        content = content.replace(/!`[^`]+`/g, '[BASH_OUTPUT]');

        // Extract and collect file references (@file)
        const fileRegex = /@([^\s]+)/g;
        let fileMatch;
        while ((fileMatch = fileRegex.exec(content)) !== null) {
            const fileRef = fileMatch[1].trim();
            if (fileRef && !fileReferences.includes(fileRef)) {
                fileReferences.push(fileRef);
            }
        }

        return { content, bashCommands, fileReferences };
    }

    /**
     * Substitute positional arguments ($1, $2, etc.)
     */
    private substitutePositionalArgs(content: string, args: string[]): string {
        return content.replace(/\$(\d+)/g, (match, index) => {
            const argIndex = parseInt(index) - 1;
            return args[argIndex] || '';
        });
    }

    /**
     * Substitute $ARGUMENTS placeholder
     */
    private substituteAllArgs(content: string, args: string[]): string {
        return content.replace(/\$ARGUMENTS/g, args.join(' '));
    }

    /**
     * Ensure commands directories exist
     */
    ensureDirectoriesExist(): void {
        if (!fs.existsSync(this.personalCommandsDir)) {
            fs.mkdirSync(this.personalCommandsDir, { recursive: true });
        }
    }

    /**
     * Get personal commands directory path
     */
    getPersonalCommandsDir(): string {
        return this.personalCommandsDir;
    }

    /**
     * Get project commands directory path
     */
    getProjectCommandsDir(): string {
        return this.projectCommandsDir;
    }
}
