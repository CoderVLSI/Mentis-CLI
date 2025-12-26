/**
 * Custom Slash Commands System
 * Users can define their own slash commands as markdown files
 */

export interface CommandFrontmatter {
    description?: string;
    'allowed-tools'?: string[];
    'argument-hint'?: string;
    model?: string;
    'disable-model-invocation'?: boolean;
}

export interface Command {
    name: string;              // Command name (from filename)
    type: 'personal' | 'project';  // Personal or project command
    path: string;               // Path to command file
    directory: string;          // Directory containing the command
    frontmatter: CommandFrontmatter;
    content: string;            // Command content (markdown)
    description: string;        // Command description
    hasParameters: boolean;     // Whether command uses parameters
}

export interface CommandExecutionContext {
    command: Command;
    args: string[];             // Command arguments
    substitutePlaceholders: (content: string, args: string[]) => string;
    executeBash: (bashCommand: string) => Promise<string>;
    readFile: (filePath: string) => Promise<string>;
}

/**
 * Parsed command with substitutions applied
 */
export interface ParsedCommand {
    content: string;            // Content with substitutions applied
    bashCommands: string[];     // Bash commands to execute
    fileReferences: string[];   // Files to read
}
