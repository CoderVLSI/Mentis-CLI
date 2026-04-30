/**
 * Single source of truth for all Mentis slash commands.
 * Both ReplManager (Enter-picker) and InputBox (live dropdown) import from here.
 * Add a new command once → it appears in both places automatically.
 */

export interface CommandEntry {
    cmd: string;
    desc: string;
}

export const COMMAND_LIST: CommandEntry[] = [
    { cmd: '/help',     desc: 'Show all available commands' },
    { cmd: '/model',    desc: 'Switch AI provider & model' },
    { cmd: '/config',   desc: 'Configure API keys & settings' },
    { cmd: '/clear',    desc: 'Clear chat history & context' },
    { cmd: '/sidekick', desc: 'Manage your sidekick companion' },
    { cmd: '/memory',   desc: 'View & manage persistent memory' },
    { cmd: '/init',     desc: 'Initialize project with .mentis.md' },
    { cmd: '/plan',     desc: 'Ask questions → plan → /build to implement' },
    { cmd: '/build',    desc: 'Execute the agreed plan' },
    { cmd: '/mcp',      desc: 'Manage MCP servers' },
    { cmd: '/add',      desc: 'Add file to context' },
    { cmd: '/image',    desc: 'Attach image to next message' },
    { cmd: '/drop',     desc: 'Remove file from context' },
    { cmd: '/resume',   desc: 'Resume last session' },
    { cmd: '/search',   desc: 'Search codebase' },
    { cmd: '/run',      desc: 'Run shell command' },
    { cmd: '/commit',   desc: 'Git commit all changes' },
    { cmd: '/skills',   desc: 'Manage agent skills' },
    { cmd: '/commands', desc: 'Manage custom slash commands' },
    { cmd: '/status',   desc: 'Show session status' },
    { cmd: '/telegram', desc: 'Configure and manage the Telegram bot channel' },
    { cmd: '/git',      desc: 'Interactive git workflow (stage, diff, commit, push)' },
    { cmd: '/share',    desc: 'Export session as markdown file' },
    { cmd: '/schedule', desc: 'Manage scheduled agent tasks (cron)' },
    { cmd: '/webhook',  desc: 'Start an HTTP server to trigger agent via POST' },
    { cmd: '/agents',   desc: 'List agents, spawn one ad-hoc, or create custom' },
    { cmd: '/trust',    desc: 'Toggle auto-approve all tools (persists across restarts)' },
    { cmd: '/exit',     desc: 'Save session & exit' },
];

/** Format for ReplManager's inquirer Enter-picker */
export const ALL_COMMANDS = COMMAND_LIST.map(({ cmd, desc }) => ({
    value: cmd,
    name: `${cmd.padEnd(12)} ${desc}`,
}));
