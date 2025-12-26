/**
 * CommandCreator - Interactive wizard for creating new custom slash commands
 */

import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CommandManager } from './CommandManager';

export class CommandCreator {
    private commandManager: CommandManager;

    constructor(commandManager?: CommandManager) {
        this.commandManager = commandManager || new CommandManager();
    }

    /**
     * Run the interactive command creation wizard
     */
    async run(name?: string): Promise<boolean> {
        console.log('\n📝 Create a new Custom Slash Command\n');

        let commandName: string;
        let commandType: 'personal' | 'project';
        let description: string;
        let allowedTools: string[] | undefined;
        let argumentHint: string | undefined;
        let namespace: string | undefined;

        // Step 1: Command Name
        if (name) {
            commandName = name;
        } else {
            const { name: inputName } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: 'Command name (lowercase, numbers, hyphens only):',
                    validate: (input: string) => {
                        if (!input) return 'Name is required';
                        if (!/^[a-z0-9-]+$/.test(input)) {
                            return 'Name must contain only lowercase letters, numbers, and hyphens';
                        }
                        if (input.length > 64) return 'Name must be 64 characters or less';
                        return true;
                    }
                }
            ]);
            commandName = inputName;
        }

        // Step 2: Command Type
        const { type } = await inquirer.prompt([
            {
                type: 'list',
                name: 'type',
                message: 'Command type:',
                choices: [
                    { name: 'Personal (available in all projects)', value: 'personal' },
                    { name: 'Project (shared with team via git)', value: 'project' }
                ],
                default: 'personal'
            }
        ]);
        commandType = type;

        // Step 3: Namespace (optional, for grouping)
        const { useNamespace } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'useNamespace',
                message: 'Add a namespace for grouping?',
                default: false
            }
        ]);

        if (useNamespace) {
            const { ns } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'ns',
                    message: 'Namespace (e.g., "git", "review", "test"):',
                    validate: (input: string) => {
                        if (!input) return 'Namespace is required';
                        if (!/^[a-z0-9-]+$/.test(input)) {
                            return 'Namespace must contain only lowercase letters, numbers, and hyphens';
                        }
                        return true;
                    }
                }
            ]);
            namespace = ns;
        }

        // Step 4: Description
        const { desc } = await inquirer.prompt([
            {
                type: 'input',
                name: 'desc',
                message: 'Description:',
                validate: (input: string) => {
                    if (!input) return 'Description is required';
                    if (input.length > 1024) return 'Description must be 1024 characters or less';
                    return true;
                }
            }
        ]);
        description = desc;

        // Step 5: Arguments (optional)
        const { useArgs } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'useArgs',
                message: 'Does this command accept arguments?',
                default: false
            }
        ]);

        if (useArgs) {
            const { hint } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'hint',
                    message: 'Argument hint (e.g., "<file>", "[options]"):',
                    validate: (input: string) => {
                        if (!input) return 'Argument hint is required';
                        return true;
                    }
                }
            ]);
            argumentHint = hint;
        }

        // Step 6: Allowed Tools (optional)
        const { useAllowedTools } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'useAllowedTools',
                message: 'Restrict which tools this command can use?',
                default: false
            }
        ]);

        if (useAllowedTools) {
            const { tools } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'tools',
                    message: 'Select allowed tools:',
                    choices: [
                        { name: 'Read (read_file)', value: 'Read' },
                        { name: 'Write (write_file)', value: 'Write' },
                        { name: 'Edit (edit_file)', value: 'Edit' },
                        { name: 'Grep (search files)', value: 'Grep' },
                        { name: 'Glob (find files)', value: 'Glob' },
                        { name: 'ListDir (list directory)', value: 'ListDir' },
                        { name: 'SearchFile (search in files)', value: 'SearchFile' },
                        { name: 'RunShell (run shell command)', value: 'RunShell' },
                        { name: 'WebSearch (web search)', value: 'WebSearch' },
                        { name: 'GitStatus', value: 'GitStatus' },
                        { name: 'GitDiff', value: 'GitDiff' },
                        { name: 'GitCommit', value: 'GitCommit' },
                        { name: 'GitPush', value: 'GitPush' },
                        { name: 'GitPull', value: 'GitPull' }
                    ]
                }
            ]);
            allowedTools = tools.length > 0 ? tools : undefined;
        }

        // Step 7: Create the command
        return this.createCommand(commandName, commandType, description, allowedTools, argumentHint, namespace);
    }

    /**
     * Create the command file
     */
    async createCommand(
        name: string,
        type: 'personal' | 'project',
        description: string,
        allowedTools?: string[],
        argumentHint?: string,
        namespace?: string
    ): Promise<boolean> {
        const baseDir = type === 'personal'
            ? path.join(os.homedir(), '.mentis', 'commands')
            : path.join(process.cwd(), '.mentis', 'commands');

        const commandDir = namespace ? path.join(baseDir, namespace) : baseDir;
        const commandFile = path.join(commandDir, `${name}.md`);

        // Check if command already exists
        if (fs.existsSync(commandFile)) {
            const { overwrite } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: `Command "${name}" already exists. Overwrite?`,
                    default: false
                }
            ]);

            if (!overwrite) {
                console.log('Cancelled.');
                return false;
            }
        }

        // Create directory
        if (!fs.existsSync(commandDir)) {
            fs.mkdirSync(commandDir, { recursive: true });
        }

        // Generate command content
        let content = `---\ndescription: ${description}\n`;

        if (allowedTools && allowedTools.length > 0) {
            content += `allowed-tools: [${allowedTools.map(t => `"${t}"`).join(', ')}]\n`;
        }

        if (argumentHint) {
            content += `argument-hint: "${argumentHint}"\n`;
        }

        content += `---\n\n`;

        // Add usage instructions in markdown
        content += `## Usage\n\n`;
        content += `Use this command by typing: /${name}${argumentHint ? ` ${argumentHint}` : ''}\n\n`;
        content += `## Instructions\n\n`;
        content += `Add your instructions here. You can use:\n`;
        content += `- \`$1\`, \`$2\`, etc. for positional arguments\n`;
        content += `- \`$ARGUMENTS\` for all arguments\n`;
        content += `- \`\!\\\`command\`\` for bash commands\n`;
        content += `- \`@file\` for file references\n\n`;

        // Write command file
        fs.writeFileSync(commandFile, content, 'utf-8');

        console.log(`\n✓ Command created at: ${commandFile}`);
        console.log(`\nNext steps:`);
        console.log(`  1. Edit ${commandFile} to add instructions`);
        console.log(`  2. Restart Mentis or use /commands validate to load the new command`);

        return true;
    }
}

/**
 * Validate commands and show results
 */
export async function validateCommands(commandManager: CommandManager): Promise<void> {
    const commands = commandManager.getAllCommands();

    console.log('\n📋 Command Validation Results\n');

    if (commands.length === 0) {
        console.log('No custom commands to validate.');
        console.log('Create commands with: /commands create');
        return;
    }

    for (const cmd of commands) {
        const isValid = cmd.name && cmd.name.length > 0 && cmd.content.length > 0;
        const icon = isValid ? '✓' : '✗';
        console.log(`${icon} /${cmd.name} (${cmd.type})`);

        if (!isValid) {
            console.log(`  ERROR: Invalid command structure`);
        }

        if (cmd.frontmatter['allowed-tools'] && cmd.frontmatter['allowed-tools'].length > 0) {
            console.log(`  Allowed tools: ${cmd.frontmatter['allowed-tools'].join(', ')}`);
        }
    }

    console.log(`\n✓ Validated ${commands.length} commands`);
}
