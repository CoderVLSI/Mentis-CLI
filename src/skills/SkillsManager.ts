/**
 * SkillsManager - Core module for Agent Skills system
 * Handles discovery, loading, and validation of skills
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { glob } from 'fast-glob';
import YAML from 'yaml';
import {
    Skill,
    SkillMetadata,
    SkillFrontmatter,
    SkillValidationResult,
    SkillContext,
    SkillDiscoveryOptions
} from './Skill';

// Re-export Skill for use in other modules
export type { Skill } from './Skill';

export class SkillsManager {
    private skills: Map<string, Skill> = new Map();
    private personalSkillsDir: string;
    private projectSkillsDir: string;

    constructor(cwd: string = process.cwd()) {
        this.personalSkillsDir = path.join(os.homedir(), '.mentis', 'skills');
        this.projectSkillsDir = path.join(cwd, '.mentis', 'skills');
    }

    /**
     * Discover all skills from configured directories
     */
    async discoverSkills(options: SkillDiscoveryOptions = {}): Promise<Skill[]> {
        const {
            includePersonal = true,
            includeProject = true,
            includePlugin = false  // Plugin skills not implemented yet
        } = options;

        const discovered: Skill[] = [];

        if (includePersonal) {
            discovered.push(...await this.discoverSkillsInDirectory(this.personalSkillsDir, 'personal'));
        }

        if (includeProject) {
            discovered.push(...await this.discoverSkillsInDirectory(this.projectSkillsDir, 'project'));
        }

        // Store skills in map for quick lookup
        for (const skill of discovered) {
            this.skills.set(skill.name, skill);
        }

        return Array.from(this.skills.values());
    }

    /**
     * Discover skills in a specific directory
     */
    private async discoverSkillsInDirectory(dir: string, type: 'personal' | 'project' | 'plugin'): Promise<Skill[]> {
        if (!fs.existsSync(dir)) {
            return [];
        }

        const skills: Skill[] = [];

        try {
            // Find all SKILL.md files in subdirectories
            const skillFiles = await glob('**/SKILL.md', {
                cwd: dir,
                absolute: true,
                onlyFiles: true
            });

            for (const skillFile of skillFiles) {
                const skillDir = path.dirname(skillFile);
                const skillName = path.basename(skillDir);

                const skill = await this.loadSkillMetadata(skillFile, skillDir, type);
                if (skill) {
                    skills.push(skill);
                }
            }
        } catch (error: any) {
            console.error(`Error discovering skills in ${dir}: ${error.message}`);
        }

        return skills;
    }

    /**
     * Load only the metadata (YAML frontmatter) from a SKILL.md file
     * This is used for progressive disclosure - only name/description loaded at startup
     */
    async loadSkillMetadata(skillPath: string, skillDir: string, type: 'personal' | 'project' | 'plugin'): Promise<Skill | null> {
        try {
            const content = fs.readFileSync(skillPath, 'utf-8');
            const frontmatter = this.extractFrontmatter(content);

            if (!frontmatter) {
                return null;
            }

            // Convert SkillFrontmatter to SkillMetadata for validation
            const metadata: SkillMetadata = {
                name: frontmatter.name,
                description: frontmatter.description,
                allowedTools: frontmatter['allowed-tools']
            };

            const validation = this.validateSkillMetadata(metadata);
            const skill: Skill = {
                name: frontmatter.name,
                description: frontmatter.description,
                allowedTools: frontmatter['allowed-tools'],
                path: skillPath,
                directory: skillDir,
                type,
                isValid: validation.isValid,
                errors: validation.errors.length > 0 ? validation.errors : undefined
            };

            return skill;
        } catch (error: any) {
            console.error(`Error loading skill metadata from ${skillPath}: ${error.message}`);
            return null;
        }
    }

    /**
     * Load the full content of a skill (for progressive disclosure)
     */
    async loadFullSkill(name: string): Promise<Skill | null> {
        const skill = this.skills.get(name);
        if (!skill) {
            return null;
        }

        try {
            const content = fs.readFileSync(skill.path, 'utf-8');
            skill.content = content;
            return skill;
        } catch (error: any) {
            console.error(`Error loading full skill ${name}: ${error.message}`);
            return null;
        }
    }

    /**
     * Extract YAML frontmatter from markdown content
     */
    private extractFrontmatter(content: string): SkillFrontmatter | null {
        const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
        const match = content.match(frontmatterRegex);

        if (!match) {
            return null;
        }

        try {
            const parsed = YAML.parse(match[1]) as SkillFrontmatter;
            return parsed;
        } catch (error) {
            return null;
        }
    }

    /**
     * Validate skill metadata according to Claude Code spec
     */
    validateSkillMetadata(metadata: SkillMetadata): SkillValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check required fields
        if (!metadata.name) {
            errors.push('Missing required field: name');
        } else {
            // Name validation: lowercase letters, numbers, hyphens only, max 64 chars
            const nameRegex = /^[a-z0-9-]+$/;
            if (!nameRegex.test(metadata.name)) {
                errors.push('Name must contain only lowercase letters, numbers, and hyphens');
            }
            if (metadata.name.length > 64) {
                errors.push('Name must be 64 characters or less');
            }
        }

        if (!metadata.description) {
            errors.push('Missing required field: description');
        } else {
            if (metadata.description.length > 1024) {
                errors.push('Description must be 1024 characters or less');
            }
            // Check if description mentions when to use
            if (!metadata.description.toLowerCase().includes('use when') &&
                !metadata.description.toLowerCase().includes('use for')) {
                warnings.push('Description should include when to use this skill (e.g., "Use when...")');
            }
        }

        // Validate allowed-tools if present
        if (metadata.allowedTools) {
            const validTools = [
                'Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'WebSearch',
                'GitStatus', 'GitDiff', 'GitCommit', 'GitPush', 'GitPull',
                'ListDir', 'SearchFile', 'RunShell'
            ];
            const invalidTools = metadata.allowedTools.filter(t => !validTools.includes(t));
            if (invalidTools.length > 0) {
                warnings.push(`Unknown tools in allowed-tools: ${invalidTools.join(', ')}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get skill by name
     */
    getSkill(name: string): Skill | undefined {
        return this.skills.get(name);
    }

    /**
     * Get all skills
     */
    getAllSkills(): Skill[] {
        return Array.from(this.skills.values());
    }

    /**
     * Get skills formatted for model context injection
     * This provides only metadata for progressive disclosure
     */
    getSkillsContext(): string {
        const skills = this.getAllSkills().filter(s => s.isValid);

        if (skills.length === 0) {
            return '';
        }

        const context = skills.map(skill => {
            return `- ${skill.name}: ${skill.description}`;
        }).join('\n');

        return `Available Skills:\n${context}`;
    }

    /**
     * Get skills as SkillContext array
     */
    getSkillsContextArray(): SkillContext[] {
        return this.getAllSkills()
            .filter(s => s.isValid)
            .map(s => ({
                name: s.name,
                description: s.description
            }));
    }

    /**
     * Validate all loaded skills
     */
    validateAllSkills(): Map<string, SkillValidationResult> {
        const results = new Map<string, SkillValidationResult>();

        for (const [name, skill] of this.skills) {
            const metadata: SkillMetadata = {
                name: skill.name,
                description: skill.description,
                allowedTools: skill.allowedTools
            };
            results.set(name, this.validateSkillMetadata(metadata));
        }

        return results;
    }

    /**
     * Read a supporting file from a skill directory
     * Used for progressive disclosure of skill resources
     */
    readSkillFile(skillName: string, fileName: string): string | null {
        const skill = this.skills.get(skillName);
        if (!skill) {
            return null;
        }

        const filePath = path.join(skill.directory, fileName);
        if (!fs.existsSync(filePath)) {
            return null;
        }

        try {
            return fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            return null;
        }
    }

    /**
     * List supporting files in a skill directory
     */
    listSkillFiles(skillName: string): string[] {
        const skill = this.skills.get(skillName);
        if (!skill) {
            return [];
        }

        if (!fs.existsSync(skill.directory)) {
            return [];
        }

        try {
            const files = fs.readdirSync(skill.directory);
            // Exclude SKILL.md as it's the main file
            return files.filter(f => f !== 'SKILL.md');
        } catch (error) {
            return [];
        }
    }

    /**
     * Create skills directories if they don't exist
     */
    ensureDirectoriesExist(): void {
        if (!fs.existsSync(this.personalSkillsDir)) {
            fs.mkdirSync(this.personalSkillsDir, { recursive: true });
        }
    }

    /**
     * Get personal skills directory path
     */
    getPersonalSkillsDir(): string {
        return this.personalSkillsDir;
    }

    /**
     * Get project skills directory path
     */
    getProjectSkillsDir(): string {
        return this.projectSkillsDir;
    }
}
