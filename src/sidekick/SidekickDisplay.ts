/**
 * SidekickDisplay - Terminal rendering for your sidekick
 */

import chalk from 'chalk';
import { Sidekick, Rarity, Mood, StatKey } from './SidekickTypes';
import { getArt } from './SidekickArt';

const RARITY_COLORS: Record<Rarity, chalk.Chalk> = {
    common:    chalk.white,
    uncommon:  chalk.green,
    rare:      chalk.blue,
    epic:      chalk.magenta,
    legendary: chalk.yellow,
};

const MOOD_COLORS: Record<Mood, chalk.Chalk> = {
    happy:    chalk.green,
    focused:  chalk.cyan,
    stressed: chalk.red,
    excited:  chalk.yellow,
    sleepy:   chalk.blue,
    hyped:    chalk.magentaBright,
};

const MOOD_EMOJI: Record<Mood, string> = {
    happy:    '😊',
    focused:  '🎯',
    stressed: '😰',
    excited:  '⚡',
    sleepy:   '😴',
    hyped:    '🔥',
};

/** Compact one-line banner shown at session start */
export function renderBanner(s: Sidekick): void {
    const rarityColor = RARITY_COLORS[s.rarity];
    const moodColor = MOOD_COLORS[s.mood];
    const shiny = s.isShiny ? chalk.yellow(' ★ SHINY') : '';

    console.log(
        chalk.dim('  ┌─ sidekick ') +
        rarityColor(`[${s.rarity.toUpperCase()}]`) +
        shiny +
        chalk.dim(' ─────────────────────')
    );
    console.log(
        `  │  ${chalk.bold(s.name)} ` +
        chalk.dim(`the ${s.species}`) +
        `  lv.${chalk.cyan(s.level)}  ` +
        moodColor(`${MOOD_EMOJI[s.mood]} ${s.mood}`)
    );
    console.log(chalk.dim('  └────────────────────────────────────'));
}

/** Full stats card — shown by /sidekick card */
export function renderCard(s: Sidekick): void {
    const rarityColor = RARITY_COLORS[s.rarity];
    const art = getArt(s.species, s.isShiny);
    const shiny = s.isShiny ? chalk.yellow(' ★ SHINY') : '';
    const border = '═'.repeat(38);

    console.log('');
    console.log(chalk.dim(`  ╔${border}╗`));
    console.log(
        chalk.dim('  ║  ') +
        chalk.bold.white(`${s.name}`) +
        chalk.dim('  ·  ') +
        rarityColor(s.rarity.toUpperCase()) +
        shiny +
        chalk.dim('  ║')
    );
    console.log(chalk.dim(`  ╠${border}╣`));

    // Art + stats side by side
    const statKeys: StatKey[] = [
        'RECURSION_DEPTH', 'COFFEE_LEVEL', 'DEBUG_KARMA',
        'CHAOS_TOLERANCE', 'TOKEN_WISDOM',
    ];

    const maxLines = Math.max(art.length, statKeys.length + 2);

    for (let i = 0; i < maxLines; i++) {
        const artLine = (art[i] ?? '          ').padEnd(12);

        let statLine = '';
        if (i === 0) {
            statLine = chalk.dim(`Species  : `) + chalk.cyan(s.species);
        } else if (i === 1) {
            statLine = chalk.dim(`Affinity : `) + chalk.green(s.languageAffinity);
        } else {
            const sk = statKeys[i - 2];
            if (sk) {
                const val = s.stats[sk];
                const bar = renderBar(val);
                const isPeak = sk === s.peakStat;
                const isDump = sk === s.dumpStat;
                const label = sk.replace(/_/g, ' ').padEnd(17);
                const marker = isPeak ? chalk.green(' ▲') : isDump ? chalk.red(' ▼') : '  ';
                statLine = chalk.dim(label) + bar + chalk.dim(` ${val}`) + marker;
            }
        }

        console.log(chalk.dim('  ║  ') + chalk.cyan(artLine) + '  ' + statLine);
    }

    console.log(chalk.dim(`  ╠${border}╣`));

    // Mood + level + streak
    const moodColor = MOOD_COLORS[s.mood];
    console.log(
        chalk.dim('  ║  ') +
        chalk.dim('Mood: ') + moodColor(`${MOOD_EMOJI[s.mood]} ${s.mood.toUpperCase()}`) +
        chalk.dim('   Level: ') + chalk.cyan(s.level) +
        chalk.dim('   Streak: ') + chalk.yellow(`${s.streak}d`)
    );
    console.log(
        chalk.dim('  ║  ') +
        chalk.dim('XP: ') + renderXpBar(s.xp, s.level)
    );

    const hatched = new Date(s.hatchedAt).toLocaleDateString();
    console.log(chalk.dim(`  ║  Hatched: ${hatched}   ID: #${s.id}`));
    console.log(chalk.dim(`  ╚${border}╝`));
    console.log('');
}

function renderBar(value: number): string {
    const filled = Math.round(value / 10);
    const empty = 10 - filled;
    return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

function renderXpBar(xp: number, level: number): string {
    const needed = level * 100;
    const pct = Math.min(xp / needed, 1);
    const filled = Math.round(pct * 20);
    const empty = 20 - filled;
    return (
        '[' +
        chalk.cyan('█'.repeat(filled)) +
        chalk.dim('░'.repeat(empty)) +
        `] ${xp}/${needed}`
    );
}

/** Interaction response — shown by /sidekick interact */
export function renderInteraction(s: Sidekick): void {
    const lines: Record<Mood, string[]> = {
        happy:    [
            `${s.name} wags its ${s.species} tail happily. 😊`,
            `"I love coding with you!" ${s.name} chirps.`,
            `${s.name} does a little spin. ✨`,
        ],
        focused:  [
            `${s.name} stares at the screen intensely. 🎯`,
            `"Shhh. Debugging." ${s.name} whispers.`,
            `${s.name} doesn't even look up. Deep in flow.`,
        ],
        stressed: [
            `${s.name} is sweating. 😰 Too many errors!`,
            `"It compiles on my machine!!" ${s.name} cries.`,
            `${s.name} rocks back and forth. "Just one more fix..."`,
        ],
        excited:  [
            `${s.name} zaps around the terminal! ⚡`,
            `"We're shipping SO much today!!" ${s.name} shouts.`,
            `${s.name} is vibrating with energy.`,
        ],
        sleepy:   [
            `${s.name} yawns. 😴 It's 3am...`,
            `"...just five more minutes..." ${s.name} mumbles.`,
            `${s.name} falls asleep on the keyboard. zzz`,
        ],
        hyped:    [
            `${s.name} is ON FIRE! 🔥 Zero errors, pure flow.`,
            `"NOTHING CAN STOP US!!" ${s.name} screams.`,
            `${s.name} is absolutely unhinged with productivity.`,
        ],
    };

    const responses = lines[s.mood];
    const response = responses[Math.floor(Math.random() * responses.length)];
    console.log('');
    console.log(`  ${response}`);
    console.log('');
}
