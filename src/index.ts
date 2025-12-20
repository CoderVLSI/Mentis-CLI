#!/usr/bin/env node
import { ReplManager } from './repl/ReplManager';

async function main() {
    if (process.argv.includes('update')) {
        const { UpdateManager } = require('./utils/UpdateManager');
        const updater = new UpdateManager();
        await updater.checkAndPerformUpdate(true);
        return;
    }

    const repl = new ReplManager();
    await repl.start();
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
