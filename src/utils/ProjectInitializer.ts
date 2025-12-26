/**
 * ProjectInitializer - Initialize project with .mentis.md
 * Interactive wizard for creating project guide files
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class ProjectInitializer {
    /**
     * Run the interactive project initialization wizard
     */
    async run(cwd: string = process.cwd()): Promise<boolean> {
        console.log('\n📁 Initialize Project with .mentis.md\n');

        // Step 1: Project name
        const { projectName } = await inquirer.prompt([
            {
                type: 'input',
                name: 'projectName',
                message: 'Project name:',
                default: path.basename(cwd)
            }
        ]);

        // Step 2: Project description
        const { description } = await inquirer.prompt([
            {
                type: 'input',
                name: 'description',
                message: 'Brief description:',
                default: 'A software project'
            }
        ]);

        // Step 3: Tech stack
        const { techStack } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'techStack',
                message: 'Select technologies:',
                choices: [
                    'TypeScript',
                    'JavaScript',
                    'Python',
                    'React',
                    'Vue',
                    'Node.js',
                    'Express',
                    'PostgreSQL',
                    'MongoDB',
                    'Redis',
                    'Docker',
                    'GraphQL',
                    'REST API',
                    'Other'
                ]
            }
        ]);

        // Step 4: Project type
        const { projectType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'projectType',
                message: 'Project type:',
                choices: ['Web Application', 'API/Backend', 'CLI Tool', 'Library/Package', 'Mobile App', 'Desktop App', 'Other']
            }
        ]);

        // Step 5: Conventions
        const { useConventions } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'useConventions',
                message: 'Add coding conventions?',
                default: true
            }
        ]);

        let conventions = '';
        if (useConventions) {
            const { conventionStyle } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'conventionStyle',
                    message: 'Style guide:',
                    choices: ['Standard', 'Airbnb', 'Google', 'Prettier', 'Custom']
                }
            ]);

            conventions = this.getConventionText(conventionStyle);
        }

        // Create .mentis.md content
        const content = this.generateMentisMd({
            projectName,
            description,
            techStack,
            projectType,
            conventions
        });

        // Write to file
        const mentisMdPath = path.join(cwd, '.mentis.md');
        fs.writeFileSync(mentisMdPath, content, 'utf-8');

        console.log(chalk.green(`\n✓ Created .mentis.md`));
        console.log(chalk.dim(`\nTip: Edit .mentis.md to add project-specific instructions for Mentis.\n`));

        return true;
    }

    /**
     * Generate .mentis.md content
     */
    private generateMentisMd(options: {
        projectName: string;
        description: string;
        techStack: string[];
        projectType: string;
        conventions: string;
    }): string {
        const { projectName, description, techStack, projectType, conventions } = options;

        let content = `# ${projectName}\n\n`;
        content += `${description}\n\n`;
        content += `**Type**: ${projectType}\n\n`;
        content += `## Tech Stack\n\n`;
        content += techStack.map(t => `- ${t}`).join('\n');
        content += `\n\n`;

        if (conventions) {
            content += `## Coding Conventions\n\n`;
            content += `${conventions}\n\n`;
        }

        content += `## Project Structure\n\n`;
        content += `<!-- Add project structure here -->\n\n`;

        content += `## Guidelines for Mentis\n\n`;
        content += `- When writing code, follow the conventions above\n`;
        content += `- Prefer existing patterns in the codebase\n`;
        content += `- Add comments for complex logic\n`;
        content += `- Run tests before suggesting changes\n\n`;

        content += `## Common Commands\n\n`;
        content += `<!-- Add common development commands here -->\n`;

        return content;
    }

    /**
     * Get convention text based on style
     */
    private getConventionText(style: string): string {
        const conventions: Record<string, string> = {
            'Standard': `- Use 2 spaces for indentation\n- Use camelCase for variables\n- Use PascalCase for classes\n- Prefer const over let\n- Use arrow functions`,
            'Airbnb': `- Follow Airbnb Style Guide\n- Use 2 spaces for indentation\n- Prefer named exports\n- Use template literals`,
            'Google': `- Follow Google JavaScript Style Guide\n- Use 2 spaces for indentation\n- JSDoc comments for functions`,
            'Prettier': `- Use Prettier for formatting\n- 2 spaces for indentation\n- Single quotes for strings\n- No trailing commas`,
            'Custom': `- Define your conventions below`
        };

        return conventions[style] || conventions['Standard'];
    }
}
