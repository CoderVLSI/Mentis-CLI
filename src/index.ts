#!/usr/bin/env node
import { ReplManager } from './repl/ReplManager';

interface CliOptions {
    resume: boolean;
    yolo: boolean;
}

function parseArgs(): { command: string | null, options: CliOptions } {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        resume: false,
        yolo: false
    };

    let command: string | null = null;

    for (const arg of args) {
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
            case '-h':
            case '--help':
                console.log(`
Mentis CLI - AI Coding Assistant

Usage:
  mentis                    Start interactive REPL
  mentis update             Update to latest version
  mentis --resume           Resume last session
  mentis --yolo             Auto-confirm mode (skip confirmations)

Options:
  --resume                  Load latest checkpoint on start
  --yolo                    Skip all confirmation prompts
  -h, --help                Show this help message

Commands (in REPL):
  /help                     Show all available commands
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

async function main() {
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

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
