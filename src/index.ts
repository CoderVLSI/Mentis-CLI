#!/usr/bin/env node
import { ReplManager } from './repl/ReplManager';

async function main() {
    const repl = new ReplManager();
    await repl.start();
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
