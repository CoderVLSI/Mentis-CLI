/**
 * SettingsManager - Manages Mentis settings.json
 *
 * Loads and merges settings from two locations (project wins over global):
 *   1. ~/.mentis/settings.json      — user-level (global)
 *   2. .mentis/settings.json        — project-level (overrides global)
 *
 * Example settings.json:
 * {
 *   "hooks": {
 *     "SessionStart": [{ "command": "echo ready" }],
 *     "PreToolUse":   [{ "command": "./hooks/pre-tool.sh", "blocking": true }],
 *     "PostToolUse":  [{ "command": "./hooks/post-tool.sh" }],
 *     "Stop":         [{ "command": "./hooks/cleanup.sh" }]
 *   },
 *   "permissions": {
 *     "write_file":  "ask",
 *     "edit_file":   "ask",
 *     "read_file":   "allow",
 *     "run_shell":   "ask",
 *     "git_push":    "deny"
 *   }
 * }
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { HooksConfig } from '../hooks/HooksManager';
import { PermissionsConfig } from '../permissions/PermissionManager';

export interface MentisSettings {
    hooks?: HooksConfig;
    permissions?: PermissionsConfig;
}

export class SettingsManager {
    private globalSettingsPath: string;
    private projectSettingsPath: string;
    private settings: MentisSettings = {};

    constructor(cwd: string = process.cwd()) {
        this.globalSettingsPath = path.join(os.homedir(), '.mentis', 'settings.json');
        this.projectSettingsPath = path.join(cwd, '.mentis', 'settings.json');
        this.load();
    }

    private load(): void {
        const global = this.readFile(this.globalSettingsPath);
        const project = this.readFile(this.projectSettingsPath);
        this.settings = this.merge(global, project);
    }

    private readFile(filePath: string): MentisSettings {
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch {
            // Silently ignore parse or read errors
        }
        return {};
    }

    /**
     * Deep-merge two settings objects. Project-level values override global.
     * For arrays (hooks), project arrays replace global arrays entirely.
     */
    private merge(base: MentisSettings, override: MentisSettings): MentisSettings {
        return {
            hooks: {
                ...base.hooks,
                ...override.hooks,
            },
            permissions: {
                ...base.permissions,
                ...override.permissions,
            },
        };
    }

    getSettings(): MentisSettings {
        return this.settings;
    }

    getHooks(): HooksConfig {
        return this.settings.hooks ?? {};
    }

    getPermissions(): PermissionsConfig {
        return this.settings.permissions ?? {};
    }

    /** Reload from disk (useful if settings.json was edited during a session). */
    reload(): void {
        this.load();
    }

    /**
     * Persist settings to the project-level settings.json.
     * Creates .mentis/ directory if it does not exist.
     */
    save(settings: MentisSettings): void {
        fs.ensureDirSync(path.dirname(this.projectSettingsPath));
        fs.writeFileSync(
            this.projectSettingsPath,
            JSON.stringify(settings, null, 2),
            'utf-8'
        );
        this.settings = settings;
    }

    /** Path of the project-level settings file (useful for `/settings` command). */
    getProjectSettingsPath(): string {
        return this.projectSettingsPath;
    }

    /** Path of the global settings file. */
    getGlobalSettingsPath(): string {
        return this.globalSettingsPath;
    }
}
