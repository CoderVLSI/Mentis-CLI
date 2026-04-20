import chalk, { ChalkInstance } from 'chalk';
import { Sidekick, Mood } from '../sidekick/SidekickTypes';
import { getArt } from '../sidekick/SidekickArt';

const VERSION = 'v1.2.0';

const MOOD_EMOJI: Record<Mood, string> = {
    happy:    '😊',
    focused:  '🎯',
    stressed: '😰',
    excited:  '⚡',
    sleepy:   '😴',
    hyped:    '🔥',
};

const MOOD_COLOR: Record<Mood, ChalkInstance> = {
    happy:    chalk.green,
    focused:  chalk.cyan,
    stressed: chalk.red,
    excited:  chalk.yellow,
    sleepy:   chalk.blue,
    hyped:    chalk.magentaBright,
};

// Strip ANSI codes to get visible length
function visLen(s: string): number {
    return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

// Right-pad to visible width
function rpad(s: string, width: number): string {
    const pad = width - visLen(s);
    return pad > 0 ? s + ' '.repeat(pad) : s;
}

export class UIManager {

    /** Startup dashboard — mascot left, info right, tips bottom */
    public static renderDashboard(config: {
        model: string;
        cwd: string;
        sidekick?: Sidekick | null;
        lastSession?: { timestamp: number; messages: number } | null;
    }): void {
        console.clear();

        const { model, cwd, sidekick, lastSession } = config;
        const width = Math.min(process.stdout.columns || 80, 88);
        const inner = width - 2; // inside the border

        // ── art column (left, 14 chars) ──────────────────────────────────
        const ART_W = 14;
        const artLines: string[] = sidekick
            ? getArt(sidekick.species, sidekick.isShiny).map(l => l.padEnd(ART_W))
            : [
                '  ┌──────┐  ',
                '  │ M  M │  ',
                '  │  ▄▄  │  ',
                '  │  ──  │  ',
                '  └──────┘  ',
            ].map(l => l.padEnd(ART_W));

        // ── info column (right) ──────────────────────────────────────────
        const INFO_W = inner - ART_W - 3; // 3 = left border + gap + right border
        const shortDir = cwd.replace(process.env.HOME || '', '~');
        const shortModel = model.length > INFO_W - 9 ? model.substring(0, INFO_W - 12) + '...' : model;

        const moodLine = sidekick
            ? MOOD_COLOR[sidekick.mood](
                `${MOOD_EMOJI[sidekick.mood]} ${sidekick.mood}  lv.${sidekick.level}`
              )
            : chalk.dim('No sidekick yet — type /sidekick hatch');

        const nameLabel = sidekick
            ? chalk.bold(sidekick.name) + chalk.dim(` the ${sidekick.species}`)
            : chalk.dim('Mentis');

        const lastLine = lastSession
            ? chalk.dim(`Last session: ${new Date(lastSession.timestamp).toLocaleString()}  (${lastSession.messages} msgs)`)
            : chalk.dim('No recent activity');

        const infoLines = [
            chalk.bold('Welcome back!'),
            '',
            nameLabel,
            moodLine,
            '',
            chalk.dim('Model  ') + chalk.cyan(shortModel),
            chalk.dim('Dir    ') + chalk.dim(shortDir),
            '',
            lastLine,
        ];

        // ── header ───────────────────────────────────────────────────────
        const title = ` Mentis-CLI ${VERSION} `;
        const borderTop = '─'.repeat(Math.floor((width - title.length - 2) / 2));
        const borderTopR = '─'.repeat(width - borderTop.length - title.length - 2);
        console.log(chalk.cyan(`╭${borderTop}`) + chalk.bold.cyan(title) + chalk.cyan(`${borderTopR}╮`));

        // ── body rows ────────────────────────────────────────────────────
        const rows = Math.max(artLines.length, infoLines.length);
        for (let i = 0; i < rows; i++) {
            const art = chalk.cyan(artLines[i] ?? ' '.repeat(ART_W));
            const info = infoLines[i] ?? '';
            const rowContent = ' ' + art + '  ' + info;
            const visible = visLen(rowContent);
            const pad = Math.max(0, inner - visible);
            console.log(chalk.cyan('│') + rowContent + ' '.repeat(pad) + chalk.cyan('│'));
        }

        // ── tips bar ─────────────────────────────────────────────────────
        const divider = '─'.repeat(inner);
        console.log(chalk.cyan('├') + chalk.dim(divider) + chalk.cyan('┤'));

        const tips = chalk.dim('  /help  /config  /mcp  /model  Esc to cancel  /sidekick');
        const tipsPad = Math.max(0, inner - visLen(tips));
        console.log(chalk.cyan('│') + tips + ' '.repeat(tipsPad) + chalk.cyan('│'));

        console.log(chalk.cyan('╰') + chalk.cyan('─'.repeat(inner)) + chalk.cyan('╯'));
        console.log('');
    }

    /** Fallback logo — used only for /clear */
    public static displayLogo() {
        console.clear();
        const lines = [
            chalk.cyan('  ╭── ') + chalk.bold('Mentis CLI') + chalk.cyan(` ${VERSION} ──╮`),
            chalk.cyan('  │') + chalk.dim('  AI Coding Agent     ') + chalk.cyan('│'),
            chalk.cyan('  ╰──────────────────────────╯'),
        ];
        lines.forEach(l => console.log(l));
        console.log('');
    }

    public static printSeparator() {
        console.log(chalk.gray('──────────────────────────────────────────────────'));
    }

    public static logBullet(text: string, color: 'cyan' | 'green' | 'yellow' | 'red' | 'blue' | 'magenta' | 'white' = 'white') {
        const bullet = color === 'white' ? '●' : chalk[color]('●');
        console.log(`  ${bullet} ${text}`);
    }

    public static logSystem(text: string) {
        console.log(chalk.dim(`    ${text}`));
    }

    public static logTransition(text: string) {
        console.log(`  ${chalk.red('+')} ${chalk.red(text)}`);
    }
}
