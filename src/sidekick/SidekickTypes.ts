export const SPECIES = [
    'daemon', 'pixel', 'seggy', 'regex', 'nibble', 'repl',
    'null', 'hexer', 'stack', 'lambda', 'goroutine', 'recursion',
    'cache', 'token', 'mutex', 'promise', 'shard', 'bit',
] as const;

export type Species = typeof SPECIES[number];

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = typeof RARITIES[number];

export const MOODS = ['happy', 'focused', 'stressed', 'excited', 'sleepy', 'hyped'] as const;
export type Mood = typeof MOODS[number];

export const STAT_KEYS = [
    'RECURSION_DEPTH',
    'COFFEE_LEVEL',
    'DEBUG_KARMA',
    'CHAOS_TOLERANCE',
    'TOKEN_WISDOM',
] as const;

export type StatKey = typeof STAT_KEYS[number];

export interface SidekickStats {
    RECURSION_DEPTH: number;
    COFFEE_LEVEL: number;
    DEBUG_KARMA: number;
    CHAOS_TOLERANCE: number;
    TOKEN_WISDOM: number;
}

export interface Sidekick {
    id: string;
    species: Species;
    name: string;
    rarity: Rarity;
    isShiny: boolean;
    stats: SidekickStats;
    personality: string;
    mood: Mood;
    level: number;
    xp: number;
    streak: number;
    lastSeen: string;      // ISO date
    hatchedAt: string;     // ISO date
    languageAffinity: string;
    peakStat: StatKey;
    dumpStat: StatKey;
}

/** Per-session activity counters fed into mood calculation */
export interface SessionActivity {
    errors: number;
    successes: number;
    toolCalls: number;
    startedAt: number; // Date.now()
}
