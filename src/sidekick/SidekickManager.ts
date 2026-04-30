/**
 * SidekickManager - Persists and manages your sidekick across sessions
 *
 * Stored at ~/.mentis/sidekick.json
 *
 * Handles:
 *  - First-time hatch (generate + name via LLM)
 *  - Mood updates based on session activity
 *  - XP + level tracking
 *  - Streak tracking (days in a row)
 *  - Toggle showOnStart via settings
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { Sidekick, Mood, SessionActivity, EvolutionStage, EVOLUTION_LEVELS, evolutionLabel } from './SidekickTypes';
import { generateSidekick } from './SidekickGenerator';

const SIDEKICK_PATH = path.join(os.homedir(), '.mentis', 'sidekick.json');

// XP required per level (simple curve)
const xpForLevel = (level: number) => level * 100;

export class SidekickManager {
    private sidekick: Sidekick | null = null;
    private activity: SessionActivity = {
        errors: 0,
        successes: 0,
        toolCalls: 0,
        startedAt: Date.now(),
    };

    constructor() {
        this.load();
    }

    /** Load sidekick from disk. Returns null if not yet hatched. */
    private load(): void {
        try {
            if (fs.existsSync(SIDEKICK_PATH)) {
                this.sidekick = JSON.parse(fs.readFileSync(SIDEKICK_PATH, 'utf-8'));
            }
        } catch {
            this.sidekick = null;
        }
    }

    private save(): void {
        if (!this.sidekick) return;
        try {
            fs.ensureDirSync(path.dirname(SIDEKICK_PATH));
            fs.writeFileSync(SIDEKICK_PATH, JSON.stringify(this.sidekick, null, 2));
        } catch {
            // non-critical
        }
    }

    get(): Sidekick | null {
        return this.sidekick;
    }

    isHatched(): boolean {
        return this.sidekick !== null;
    }

    /** Hatch instantly — name and personality generated from machine seed, no LLM needed. */
    hatchInstant(): Sidekick {
        this.sidekick = generateSidekick();
        this.save();
        return this.sidekick;
    }

    /** Legacy hatch with explicit name/personality (kept for compatibility). */
    hatch(name: string, personality: string): Sidekick {
        const base = generateSidekick();
        this.sidekick = { ...base, name, personality };
        this.save();
        return this.sidekick;
    }

    /** Increment interaction count and check for evolution. Returns true if evolved. */
    recordInteraction(): boolean {
        if (!this.sidekick) return false
        this.sidekick.totalInteractions = (this.sidekick.totalInteractions ?? 0) + 1
        const evolved = this.checkEvolution()
        this.save()
        return evolved
    }

    /** Check if the sidekick should evolve based on current level. Returns true if it did. */
    private checkEvolution(): boolean {
        if (!this.sidekick) return false
        const stage = (this.sidekick.evolutionStage ?? 0) as EvolutionStage
        if (stage >= 2) return false

        const nextStage = (stage + 1) as EvolutionStage
        if (this.sidekick.level < EVOLUTION_LEVELS[nextStage]) return false

        // Evolve!
        this.sidekick.evolutionStage = nextStage
        // Boost all stats by 10 on evolution
        for (const key of Object.keys(this.sidekick.stats) as Array<keyof typeof this.sidekick.stats>) {
            this.sidekick.stats[key] = Math.min(100, this.sidekick.stats[key] + 10)
        }
        return true
    }

    /** Record a tool call result for mood calculation */
    recordToolCall(isError: boolean): void {
        this.activity.toolCalls++;
        if (isError) {
            this.activity.errors++;
        } else {
            this.activity.successes++;
        }
        this.recalculateMood();
    }

    /** Recalculate mood based on session activity */
    private recalculateMood(): void {
        if (!this.sidekick) return;

        const { errors, successes, toolCalls, startedAt } = this.activity;
        const sessionMinutes = (Date.now() - startedAt) / 60_000;
        const hour = new Date().getHours();

        let mood: Mood;

        if (hour >= 0 && hour < 6) {
            mood = 'sleepy';
        } else if (errors > 5 && errors > successes * 2) {
            mood = 'stressed';
        } else if (successes > 10 && errors < 2) {
            mood = 'hyped';
        } else if (toolCalls > 20) {
            mood = 'excited';
        } else if (sessionMinutes > 60 && errors < 3) {
            mood = 'focused';
        } else {
            mood = 'happy';
        }

        if (this.sidekick.mood !== mood) {
            this.sidekick.mood = mood;
            this.save();
        }
    }

    /** Called at end of session to award XP and update streak */
    endSession(): void {
        if (!this.sidekick) return;

        const { successes, toolCalls } = this.activity;
        const xpGained = Math.floor(successes * 2 + toolCalls * 0.5);

        this.sidekick.xp += xpGained;
        this.sidekick.lastSeen = new Date().toISOString();

        // Level up
        while (this.sidekick.xp >= xpForLevel(this.sidekick.level)) {
            this.sidekick.xp -= xpForLevel(this.sidekick.level);
            this.sidekick.level++;
        }

        // Check evolution after levelling up
        this.checkEvolution()

        // Streak: increment if last seen was yesterday, reset if gap > 1 day
        const lastSeen = new Date(this.sidekick.lastSeen);
        const today = new Date();
        const diffDays = Math.floor(
            (today.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays === 1) {
            this.sidekick.streak++;
        } else if (diffDays > 1) {
            this.sidekick.streak = 1;
        }

        this.save();
    }

    /** Human-readable species label including evolution stage */
    speciesLabel(): string {
        if (!this.sidekick) return ''
        const stage = (this.sidekick.evolutionStage ?? 0) as EvolutionStage
        return evolutionLabel(this.sidekick.species, stage)
    }

    evolutionStage(): EvolutionStage {
        return (this.sidekick?.evolutionStage ?? 0) as EvolutionStage
    }

    /** Mood emoji for inline display */
    moodEmoji(mood: Mood): string {
        const emojis: Record<Mood, string> = {
            happy: '😊',
            focused: '🎯',
            stressed: '😰',
            excited: '⚡',
            sleepy: '😴',
            hyped: '🔥',
        };
        return emojis[mood];
    }

    moodLabel(mood: Mood): string {
        return mood.toUpperCase();
    }
}
