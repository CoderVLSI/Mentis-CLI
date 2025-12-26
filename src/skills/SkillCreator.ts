/**
 * SkillCreator - Interactive wizard for creating new skills
 */

import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillsManager } from './SkillsManager';

export class SkillCreator {
    private skillsManager: SkillsManager;

    constructor(skillsManager?: SkillsManager) {
        this.skillsManager = skillsManager || new SkillsManager();
    }

    /**
     * Run the interactive skill creation wizard
     */
    async run(name?: string): Promise<boolean> {
        console.log('\n📝 Create a new Skill\n');

        let skillName: string;
        let skillType: 'personal' | 'project';
        let description: string;
        let allowedTools: string[] | undefined;

        // Step 1: Skill Name
        if (name) {
            skillName = name;
        } else {
            const { name: inputName } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: 'Skill name (lowercase, numbers, hyphens only):',
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
            skillName = inputName;
        }

        // Step 2: Skill Type
        const { type } = await inquirer.prompt([
            {
                type: 'list',
                name: 'type',
                message: 'Skill type:',
                choices: [
                    { name: 'Personal (available in all projects)', value: 'personal' },
                    { name: 'Project (shared with team via git)', value: 'project' }
                ],
                default: 'personal'
            }
        ]);
        skillType = type;

        // Step 3: Description
        const { desc } = await inquirer.prompt([
            {
                type: 'input',
                name: 'desc',
                message: 'Description (what it does + when to use it):',
                validate: (input: string) => {
                    if (!input) return 'Description is required';
                    if (input.length > 1024) return 'Description must be 1024 characters or less';
                    if (!input.toLowerCase().includes('use when') && !input.toLowerCase().includes('use for')) {
                        return 'Tip: Include when to use this skill (e.g., "Use when...")';
                    }
                    return true;
                }
            }
        ]);
        description = desc;

        // Step 4: Allowed Tools (optional)
        const { useAllowedTools } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'useAllowedTools',
                message: 'Restrict which tools this skill can use?',
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

        // Step 5: Create the skill
        return this.createSkill(skillName, skillType, description, allowedTools);
    }

    /**
     * Create the skill file and directory
     */
    async createSkill(
        name: string,
        type: 'personal' | 'project',
        description: string,
        allowedTools?: string[]
    ): Promise<boolean> {
        const baseDir = type === 'personal'
            ? path.join(os.homedir(), '.mentis', 'skills')
            : path.join(process.cwd(), '.mentis', 'skills');

        const skillDir = path.join(baseDir, name);
        const skillFile = path.join(skillDir, 'SKILL.md');

        // Check if skill already exists
        if (fs.existsSync(skillFile)) {
            const { overwrite } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: `Skill "${name}" already exists. Overwrite?`,
                    default: false
                }
            ]);

            if (!overwrite) {
                console.log('Cancelled.');
                return false;
            }
        }

        // Create directory
        if (!fs.existsSync(skillDir)) {
            fs.mkdirSync(skillDir, { recursive: true });
        }

        // Generate SKILL.md content
        let content = `---\nname: ${name}\ndescription: ${description}\n`;

        if (allowedTools && allowedTools.length > 0) {
            content += `allowed-tools: [${allowedTools.map(t => `"${t}"`).join(', ')}]\n`;
        }

        content += `---\n\n# ${this.formatTitle(name)}\n\n`;

        content += `## Overview\n\n`;
        content += `This skill provides...\n\n`;
        content += `## Instructions\n\n`;
        content += `### Step 1: ...\n\n`;
        content += `### Step 2: ...\n\n`;
        content += `## Examples\n\n`;
        content += `\`\`\`\n`;
        content += `// Example usage\n`;
        content += `\`\`\`\n`;

        // Write SKILL.md
        fs.writeFileSync(skillFile, content, 'utf-8');

        console.log(`\n✓ Skill created at: ${skillFile}`);
        console.log(`\nNext steps:`);
        console.log(`  1. Edit ${skillFile} to add instructions`);
        console.log(`  2. Add supporting files (reference.md, examples.md, scripts/) as needed`);
        console.log(`  3. Restart Mentis to load the new skill`);

        return true;
    }

    /**
     * Format skill name to title case
     */
    private formatTitle(name: string): string {
        return name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

/**
 * Validate skills and show results
 */
export async function validateSkills(skillsManager: SkillsManager): Promise<void> {
    const results = skillsManager.validateAllSkills();

    console.log('\n📋 Skill Validation Results\n');

    let hasErrors = false;
    let hasWarnings = false;

    for (const [name, result] of results) {
        if (result.isValid) {
            console.log(`✓ ${name}`);
        } else {
            console.log(`✗ ${name}`);
            hasErrors = true;
        }

        if (result.errors.length > 0) {
            result.errors.forEach(err => console.log(`  ERROR: ${err}`));
        }

        if (result.warnings.length > 0) {
            hasWarnings = true;
            result.warnings.forEach(warn => console.log(`  WARNING: ${warn}`));
        }
    }

    if (!hasErrors && !hasWarnings) {
        console.log('\n✓ All skills are valid!');
    }
}
