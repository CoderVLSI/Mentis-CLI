/**
 * PermissionManager - Per-tool permission model for Mentis CLI
 *
 * Replaces the hardcoded write_file/edit_file approval check in ReplManager
 * with a flexible, configurable system that mirrors Claude Code's permission model.
 *
 * Permission modes:
 *   allow  — execute without prompting the user
 *   ask    — always prompt the user for approval before executing
 *   deny   — never execute; return an error to the LLM
 *
 * Resolution order (first match wins):
 *   1. --yolo flag → everything is 'allow'
 *   2. Project settings.json permissions
 *   3. Global settings.json permissions
 *   4. Built-in defaults (below)
 */

export type PermissionMode = 'allow' | 'ask' | 'deny';

export interface PermissionsConfig {
    [toolName: string]: PermissionMode;
}

/**
 * Built-in defaults — conservative by default, matching Claude Code behaviour.
 * Destructive or side-effectful tools default to 'ask'.
 */
const DEFAULT_PERMISSIONS: PermissionsConfig = {
    // File operations
    write_file:      'ask',
    edit_file:       'ask',
    read_file:       'allow',
    list_dir:        'allow',

    // Search
    search_files:    'allow',
    web_search:      'allow',
    web_fetch:       'allow',

    // Shell
    run_shell:       'ask',

    // Git — reads are free, writes require approval
    git_status:      'allow',
    git_diff:        'allow',
    git_commit:      'ask',
    git_push:        'ask',
    git_pull:        'ask',

    // Planning / interaction
    ask_question:    'allow',
    enter_plan_mode: 'allow',

    // Skills
    load_skill:      'allow',
    list_skills:     'allow',
    read_skill_file: 'allow',

    // Task tracking
    todo_write:      'allow',
    todo_read:       'allow',
};

export class PermissionManager {
    private config: PermissionsConfig;
    private yolo: boolean;

    constructor(config: PermissionsConfig = {}, yolo = false) {
        this.config = config;
        this.yolo = yolo;
    }

    /**
     * Effective permission for a tool.
     * Falls back to DEFAULT_PERMISSIONS then to 'ask' if unknown.
     */
    getPermission(toolName: string): PermissionMode {
        if (this.yolo) return 'allow';
        return this.config[toolName] ?? DEFAULT_PERMISSIONS[toolName] ?? 'ask';
    }

    /** Returns true when the user must be prompted before the tool runs. */
    needsApproval(toolName: string): boolean {
        return this.getPermission(toolName) === 'ask';
    }

    /** Returns true when the tool must never be executed. */
    isDenied(toolName: string): boolean {
        return this.getPermission(toolName) === 'deny';
    }

    /** Hot-reload permissions (e.g. after /settings reload). */
    updateConfig(config: PermissionsConfig): void {
        this.config = config;
    }

    /** Return a copy of all effective permissions (merged defaults + config). */
    getEffectivePermissions(): PermissionsConfig {
        return { ...DEFAULT_PERMISSIONS, ...this.config };
    }
}
