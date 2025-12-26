/**
 * LoadSkillTool - Tool for model-invoked skill loading
 * The model can call this tool when it determines a skill is relevant to the current task
 */

import { Tool } from '../tools/Tool';
import { SkillsManager, Skill } from './SkillsManager';

interface LoadSkillArgs {
    name: string;
}

type SkillLoadedCallback = (skill: Skill | null) => void;

export class LoadSkillTool implements Tool {
    name = 'load_skill';
    description = 'Load the full content of a skill by name. Use this when you need detailed instructions from a skill. Available skills can be seen in the system prompt. Example: load_skill({ name: "commit-helper" })';
    parameters = {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'The name of the skill to load (e.g., "commit-helper", "pdf-processing")'
            }
        },
        required: ['name']
    };

    private skillsManager: SkillsManager;
    private onSkillLoaded?: SkillLoadedCallback;

    constructor(skillsManager: SkillsManager, onSkillLoaded?: SkillLoadedCallback) {
        this.skillsManager = skillsManager;
        this.onSkillLoaded = onSkillLoaded;
    }

    async execute(args: LoadSkillArgs): Promise<string> {
        const { name } = args;

        if (!name) {
            return 'Error: Skill name is required';
        }

        const skill = this.skillsManager.getSkill(name);
        if (!skill) {
            const availableSkills = this.skillsManager.getAllSkills().map(s => s.name).join(', ');
            return `Error: Skill "${name}" not found. Available skills: ${availableSkills || 'none'}`;
        }

        // Load full skill content
        const fullSkill = await this.skillsManager.loadFullSkill(name);
        if (!fullSkill || !fullSkill.content) {
            return `Error: Failed to load content for skill "${name}"`;
        }

        // Notify callback that skill was loaded
        if (this.onSkillLoaded) {
            this.onSkillLoaded(fullSkill);
        }

        // Format response with skill content
        let response = `# Loaded Skill: ${skill.name}\n\n`;
        response += `**Type**: ${skill.type}\n`;
        response += `**Description**: ${skill.description}\n`;
        if (skill.allowedTools && skill.allowedTools.length > 0) {
            response += `**Allowed Tools**: ${skill.allowedTools.join(', ')}\n`;
        }
        response += `\n---\n\n`;
        response += fullSkill.content;

        return response;
    }
}

/**
 * ListSkillsTool - Tool for listing available skills
 */
export class ListSkillsTool implements Tool {
    name = 'list_skills';
    description = 'List all available skills with their descriptions. Use this to see what skills are available.';
    parameters = {
        type: 'object',
        properties: {},
        required: []
    };

    private skillsManager: SkillsManager;

    constructor(skillsManager: SkillsManager) {
        this.skillsManager = skillsManager;
    }

    async execute(): Promise<string> {
        const skills = this.skillsManager.getAllSkills();

        if (skills.length === 0) {
            return 'No skills available. Add skills to ~/.mentis/skills/ or .mentis/skills/';
        }

        let response = `# Available Skills (${skills.length})\n\n`;

        for (const skill of skills) {
            const statusIcon = skill.isValid ? '✓' : '✗';
            response += `**${statusIcon} ${skill.name}** (${skill.type})\n`;
            response += `  ${skill.description}\n`;

            if (skill.allowedTools && skill.allowedTools.length > 0) {
                response += `  Allowed tools: ${skill.allowedTools.join(', ')}\n`;
            }

            if (!skill.isValid && skill.errors) {
                response += `  Errors: ${skill.errors.join(', ')}\n`;
            }

            response += '\n';
        }

        return response;
    }
}

/**
 * ReadSkillFileTool - Tool for reading supporting files within a skill
 * Used for progressive disclosure of skill resources
 */
export class ReadSkillFileTool implements Tool {
    name = 'read_skill_file';
    description = 'Read a supporting file from within a skill directory. Use this when a skill references additional files like [reference.md](reference.md). Example: read_skill_file({ skill: "pdf-processing", file: "reference.md" })';
    parameters = {
        type: 'object',
        properties: {
            skill: {
                type: 'string',
                description: 'The name of the skill'
            },
            file: {
                type: 'string',
                description: 'The filename within the skill directory (e.g., "reference.md", "examples.md")'
            }
        },
        required: ['skill', 'file']
    };

    private skillsManager: SkillsManager;

    constructor(skillsManager: SkillsManager) {
        this.skillsManager = skillsManager;
    }

    async execute(args: { skill: string; file: string }): Promise<string> {
        const { skill, file } = args;

        if (!skill || !file) {
            return 'Error: Both skill and file parameters are required';
        }

        const content = this.skillsManager.readSkillFile(skill, file);
        if (content === null) {
            const availableFiles = this.skillsManager.listSkillFiles(skill);
            if (availableFiles.length === 0) {
                return `Error: Skill "${skill}" has no supporting files`;
            }
            return `Error: File "${file}" not found in skill "${skill}". Available files: ${availableFiles.join(', ')}`;
        }

        return content;
    }
}
