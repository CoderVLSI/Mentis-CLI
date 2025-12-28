#!/usr/bin/env node

/**
 * Mentis CLI - An Agentic, Multi-Model CLI Coding Assistant
 *
 * @packageDocumentation
 */

import { ReplManager } from './repl/ReplManager';

/**
 * CLI options for controlling Mentis behavior
 */
interface CliOptions {
    /** Resume from the last saved checkpoint */
    resume: boolean;
    /** Auto-confirm all prompts (skip confirmations) */
    yolo: boolean;
    /** Run in headless (non-interactive) mode */
    headless: boolean;
    /** Prompt to execute in headless mode */
    headlessPrompt?: string;
}

/**
 * Parse command line arguments
 *
 * @returns Parsed command and options
 *
 * @example
 * ```bash
 * mentis --resume
 * mentis -p "fix the bug"
 * mentis --yolo
 * ```
 */
function parseArgs(): { command: string | null, options: CliOptions } {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        resume: false,
        yolo: false,
        headless: false
    };

    let command: string | null = null;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case 'update':
                command = 'update';
                break;
            case '--resume':
                options.resume = true;
                break;
            case '--yolo':
                options.yolo = true;
                break;
            case '-p':
            case '--prompt':
                options.headless = true;
                options.headlessPrompt = args[++i] || '';
                break;
            case '-h':
            case '--help':
                console.log(`
Mentis CLI - AI Coding Assistant

Usage:
  mentis                    Start interactive REPL
  mentis update             Update to latest version
  mentis --resume           Resume last session
  mentis --yolo             Auto-confirm mode (skip confirmations)
  mentis -p "<prompt>"      Headless mode (non-interactive)

Options:
  --resume                  Load latest checkpoint on start
  --yolo                    Skip all confirmation prompts
  -p, --prompt <text>       Headless mode with prompt
  -h, --help                Show this help message

Commands (in REPL):
  /help                     Show all available commands
  /clear                    Clear conversation context
  /resume                   Resume last session
  /init                     Initialize project with .mentis.md
  /skills <list|show|create|validate>  Manage Agent Skills
  /commands <list|create|validate>     Manage Custom Commands
`);
                process.exit(0);
                break;
        }
    }

    return { command, options };
}

/**
 * Main entry point for Mentis CLI
 *
 * Parses arguments and starts the REPL or update manager
 */
async function main(): Promise<void> {
    const { command, options } = parseArgs();

    // Handle update command
    if (command === 'update') {
        const { UpdateManager } = require('./utils/UpdateManager');
        const updater = new UpdateManager();
        await updater.checkAndPerformUpdate(true);
        return;
    }

    // Start REPL with options
    const repl = new ReplManager(options);
    await repl.start();
}

// Start the application
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
