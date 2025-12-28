/**
 * Custom Slash Commands System
 *
 * Users can define their own slash commands as markdown files with YAML frontmatter.
 * Commands support parameter substitution, bash execution, and file references.
 *
 * @packageDocumentation
 *
 * @example
 * ```markdown
 * ---
 * description: Run tests and show coverage
 * argument-hint: [test-pattern]
 * ---
 *
 * Run tests with !`npm test $1`
 * ```
 */

/**
 * YAML frontmatter options for custom commands
 */
export interface CommandFrontmatter {
    /** Human-readable description of what the command does */
    description?: string;
    /** Restrict which tools the AI can use when executing this command */
    'allowed-tools'?: string[];
    /** Hint shown to user about expected arguments (e.g., "[pattern]") */
    'argument-hint'?: string;
    /** Specific model to use for this command */
    model?: string;
    /** Disable AI model invocation (execute bash/reads only) */
    'disable-model-invocation'?: boolean;
}

/**
 * A custom slash command
 */
export interface Command {
    /** Command name (derived from filename, without .md extension) */
    name: string;
    /** Whether this is a personal or project-level command */
    type: 'personal' | 'project';
    /** Absolute path to the command's .md file */
    path: string;
    /** Directory containing the command file */
    directory: string;
    /** Parsed YAML frontmatter from the command file */
    frontmatter: CommandFrontmatter;
    /** Raw markdown content of the command */
    content: string;
    /** Human-readable description for display */
    description: string;
    /** Whether the command uses $1, $2, or $ARGUMENTS placeholders */
    hasParameters: boolean;
}

/**
 * Execution context for running a custom command
 */
export interface CommandExecutionContext {
    /** The command being executed */
    command: Command;
    /** Arguments passed to the command */
    args: string[];
    /** Function to substitute $1, $2, $ARGUMENTS placeholders */
    substitutePlaceholders: (content: string, args: string[]) => string;
    /** Function to execute bash commands */
    executeBash: (bashCommand: string) => Promise<string>;
    /** Function to read file contents */
    readFile: (filePath: string) => Promise<string>;
}

/**
 * Parsed command with all substitutions applied
 *
 * @remarks
 * After parsing, the command content will have:
 * - $1, $2, etc. replaced with positional arguments
 * - $ARGUMENTS replaced with all arguments joined by spaces
 * - !`cmd` patterns extracted to bashCommands and replaced with [BASH_OUTPUT]
 * - @file patterns extracted to fileReferences
 */
export interface ParsedCommand {
    /** Content with all substitutions applied */
    content: string;
    /** Bash commands extracted from !`cmd` patterns */
    bashCommands: string[];
    /** File paths extracted from @file patterns */
    fileReferences: string[];
}
