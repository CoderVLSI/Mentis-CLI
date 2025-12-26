/**
 * Skill data structure for Agent Skills system
 * Based on Claude Code's Agent Skills format
 */

export interface SkillMetadata {
    name: string;           // Lowercase, numbers, hyphens only (max 64 chars)
    description: string;    // What it does + when to use it (max 1024 chars)
    allowedTools?: string[]; // Optional tool restrictions
}

export interface Skill extends SkillMetadata {
    path: string;           // Path to SKILL.md
    type: 'personal' | 'project' | 'plugin';
    content?: string;       // Loaded on demand (progressive disclosure)
    directory: string;      // Path to skill directory (for resolving supporting files)
    isValid: boolean;       // Whether skill passes validation
    errors?: string[];      // Validation errors if any
}

export interface SkillFrontmatter {
    name: string;
    description: string;
    'allowed-tools'?: string[];
}

/**
 * Validation result for a skill
 */
export interface SkillValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Skill context format for model injection
 */
export interface SkillContext {
    name: string;
    description: string;
}

/**
 * Options for skill discovery
 */
export interface SkillDiscoveryOptions {
    includePersonal?: boolean;
    includeProject?: boolean;
    includePlugin?: boolean;
}
