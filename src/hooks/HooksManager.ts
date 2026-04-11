/**
 * HooksManager - Claude Code-style lifecycle hooks for Mentis CLI
 *
 * Hooks are shell commands that fire on lifecycle events:
 *   SessionStart  — when the REPL starts
 *   PreToolUse    — before a tool is executed (can block execution)
 *   PostToolUse   — after a tool is executed
 *   Stop          — when the session ends
 *
 * Configured in .mentis/settings.json or ~/.mentis/settings.json:
 *
 * {
 *   "hooks": {
 *     "SessionStart": [{ "command": "echo Session started" }],
 *     "PreToolUse":   [{ "command": "echo Running $MENTIS_TOOL_NAME", "blocking": true }],
 *     "PostToolUse":  [{ "command": "./scripts/log-tool.sh" }],
 *     "Stop":         [{ "command": "echo Goodbye" }]
 *   }
 * }
 *
 * Environment variables available inside hook commands:
 *   MENTIS_HOOK_EVENT   — the event name
 *   MENTIS_TOOL_NAME    — tool being called (PreToolUse / PostToolUse only)
 *   MENTIS_TOOL_ARGS    — JSON-encoded tool arguments
 *   MENTIS_TOOL_RESULT  — tool result string (PostToolUse only)
 *   MENTIS_SESSION_ID   — current session ID
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

export type HookEvent = 'SessionStart' | 'PreToolUse' | 'PostToolUse' | 'Stop';

export interface HookConfig {
    /** Shell command to execute */
    command: string;
    /**
     * If true and the hook exits non-zero during PreToolUse,
     * tool execution is cancelled. Ignored for other events.
     */
    blocking?: boolean;
}

export interface HooksConfig {
    SessionStart?: HookConfig[];
    PreToolUse?: HookConfig[];
    PostToolUse?: HookConfig[];
    Stop?: HookConfig[];
}

export interface HookContext {
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: string;
    sessionId?: string;
}

export class HooksManager {
    private hooks: HooksConfig;

    constructor(hooks: HooksConfig = {}) {
        this.hooks = hooks;
    }

    /**
     * Run all hooks registered for an event.
     *
     * @returns false if a blocking PreToolUse hook failed (caller should cancel the tool);
     *          true in all other cases.
     */
    async run(event: HookEvent, context: HookContext = {}): Promise<boolean> {
        const hookList = this.hooks[event];
        if (!hookList || hookList.length === 0) return true;

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            MENTIS_HOOK_EVENT: event,
            MENTIS_TOOL_NAME: context.toolName ?? '',
            MENTIS_TOOL_ARGS: context.toolArgs ? JSON.stringify(context.toolArgs) : '',
            MENTIS_TOOL_RESULT: context.toolResult ?? '',
            MENTIS_SESSION_ID: context.sessionId ?? '',
        };

        for (const hook of hookList) {
            try {
                const { stdout, stderr } = await execAsync(hook.command, { env });
                if (stdout.trim()) {
                    console.log(chalk.dim(`[hook:${event}] ${stdout.trim()}`));
                }
                if (stderr.trim()) {
                    console.warn(chalk.dim(`[hook:${event}] stderr: ${stderr.trim()}`));
                }
            } catch (error: any) {
                console.warn(chalk.yellow(`[hook:${event}] Hook failed: ${error.message}`));
                if (hook.blocking && event === 'PreToolUse') {
                    console.warn(chalk.red(`[hook:${event}] Blocking hook failed — tool execution cancelled`));
                    return false;
                }
            }
        }

        return true;
    }

    /** Replace the hooks config (called when settings.json is reloaded). */
    updateHooks(hooks: HooksConfig): void {
        this.hooks = hooks;
    }
}
