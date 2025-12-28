/**
 * Agent Skills System
 *
 * Based on Claude Code's Agent Skills format. Skills are reusable AI agent
 * configurations stored as SKILL.md files in dedicated directories.
 *
 * @packageDocumentation
 *
 * @example
 * ```markdown
 * ---
 * name: code-reviewer
 * description: Use when the user asks for a code review. Examines code for bugs, style issues, and improvements.
 * allowed-tools: [Read, Grep, Glob]
 * ---
 *
 * Review the code for...
 * ```
 */

/**
 * Core metadata for an Agent Skill
 *
 * @remarks
 * Skills define specialized AI behaviors with optional tool restrictions.
 * The description should include when to use the skill (e.g., "Use when...").
 */
export interface SkillMetadata {
    /**
     * Lowercase skill name with numbers and hyphens only (max 64 chars)
     *
     * @pattern ^[a-z0-9-]+$
     * @maxLength 64
     */
    name: string;
    /**
     * What the skill does and when to use it (max 1024 chars)
     *
     * @remarks
     * Should include phrases like "Use when..." or "Use for..."
     * to help the AI understand when to invoke this skill.
     *
     * @maxLength 1024
     */
    description: string;
    /**
     * Optional list of tools the skill is allowed to use
     *
     * @remarks
     * If specified, the AI will be restricted to only these tools
     * when executing this skill.
     */
    allowedTools?: string[];
}

/**
 * A fully loaded Agent Skill
 */
export interface Skill extends SkillMetadata {
    /** Absolute path to the SKILL.md file */
    path: string;
    /** Whether this is personal, project, or plugin skill */
    type: 'personal' | 'project' | 'plugin';
    /**
     * Full skill content (loaded on demand)
     *
     * @remarks
     * For progressive disclosure, only metadata is loaded initially.
     * The full content is loaded only when the skill is invoked.
     */
    content?: string;
    /** Directory containing the skill (for resolving supporting files) */
    directory: string;
    /** Whether the skill passes validation */
    isValid: boolean;
    /** Validation errors if any */
    errors?: string[];
}

/**
 * YAML frontmatter parsed from SKILL.md
 */
export interface SkillFrontmatter {
    /** Skill name */
    name: string;
    /** Skill description */
    description: string;
    /**
     * Optional tool restrictions
     *
     * @remarks
     * YAML key uses kebab-case: allowed-tools
     */
    'allowed-tools'?: string[];
}

/**
 * Validation result for a skill
 */
export interface SkillValidationResult {
    /** Whether the skill is valid */
    isValid: boolean;
    /** Validation errors that must be fixed */
    errors: string[];
    /** Warnings that don't block usage */
    warnings: string[];
}

/**
 * Minimal skill context for model injection
 *
 * @remarks
 * This is the format used when injecting skills into the system prompt.
 * Only name and description are included (progressive disclosure).
 */
export interface SkillContext {
    name: string;
    description: string;
}

/**
 * Options for skill discovery
 */
export interface SkillDiscoveryOptions {
    /** Include personal skills from ~/.mentis/skills */
    includePersonal?: boolean;
    /** Include project skills from .mentis/skills */
    includeProject?: boolean;
    /** Include plugin skills (not yet implemented) */
    includePlugin?: boolean;
}
