/**
 * MemoryManager - Persistent memory across sessions and projects
 *
 * Two tiers:
 *   Global  (~/.mentis/memory.json)      — user preferences, coding style, patterns
 *   Project (.mentis/memory.json in cwd) — stack, architecture, conventions
 *
 * At session start: both are injected into the system prompt silently.
 * At session end:   LLM extracts new facts and merges them in.
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export type MemoryScope = 'global' | 'project';

export interface MemoryEntry {
    key: string;
    value: string;
    scope: MemoryScope;
    updatedAt: string;
}

export interface MemoryStore {
    version: 1;
    entries: MemoryEntry[];
}

const GLOBAL_PATH = path.join(os.homedir(), '.mentis', 'memory.json');

function projectPath(): string {
    return path.join(process.cwd(), '.mentis', 'memory.json');
}

function emptyStore(): MemoryStore {
    return { version: 1, entries: [] };
}

function loadFile(filePath: string): MemoryStore {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch {}
    return emptyStore();
}

function saveFile(filePath: string, store: MemoryStore): void {
    try {
        fs.ensureDirSync(path.dirname(filePath));
        fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
    } catch {}
}

export class MemoryManager {

    /** All memories (global + project) as a flat list */
    getAll(): MemoryEntry[] {
        const global = loadFile(GLOBAL_PATH).entries;
        const project = loadFile(projectPath()).entries;
        return [...global, ...project];
    }

    getGlobal(): MemoryEntry[] {
        return loadFile(GLOBAL_PATH).entries;
    }

    getProject(): MemoryEntry[] {
        return loadFile(projectPath()).entries;
    }

    /** Upsert a memory entry by key */
    set(key: string, value: string, scope: MemoryScope): void {
        const filePath = scope === 'global' ? GLOBAL_PATH : projectPath();
        const store = loadFile(filePath);
        const now = new Date().toISOString();
        const existing = store.entries.findIndex(e => e.key === key);
        if (existing >= 0) {
            store.entries[existing] = { key, value, scope, updatedAt: now };
        } else {
            store.entries.push({ key, value, scope, updatedAt: now });
        }
        saveFile(filePath, store);
    }

    /** Remove a memory entry by key */
    delete(key: string, scope: MemoryScope): boolean {
        const filePath = scope === 'global' ? GLOBAL_PATH : projectPath();
        const store = loadFile(filePath);
        const before = store.entries.length;
        store.entries = store.entries.filter(e => e.key !== key);
        saveFile(filePath, store);
        return store.entries.length < before;
    }

    /** Merge extracted facts from LLM into the appropriate store */
    merge(facts: Array<{ key: string; value: string; scope: MemoryScope }>): void {
        const now = new Date().toISOString();
        const globalStore = loadFile(GLOBAL_PATH);
        const projectStore = loadFile(projectPath());

        for (const { key, value, scope } of facts) {
            if (!key || !value) continue;
            const store = scope === 'global' ? globalStore : projectStore;
            const idx = store.entries.findIndex(e => e.key === key);
            if (idx >= 0) {
                store.entries[idx] = { key, value, scope, updatedAt: now };
            } else {
                store.entries.push({ key, value, scope, updatedAt: now });
            }
        }

        saveFile(GLOBAL_PATH, globalStore);
        saveFile(projectPath(), projectStore);
    }

    clearScope(scope: MemoryScope): void {
        const filePath = scope === 'global' ? GLOBAL_PATH : projectPath();
        saveFile(filePath, emptyStore());
    }

    /**
     * Build the memory block injected into the system prompt.
     * Returns empty string if no memories exist.
     */
    buildPromptBlock(): string {
        const all = this.getAll();
        if (all.length === 0) return '';

        const global = all.filter(e => e.scope === 'global');
        const project = all.filter(e => e.scope === 'project');

        const lines: string[] = ['## What I know about you'];

        if (global.length > 0) {
            lines.push('\n### Your preferences & patterns (all projects)');
            for (const e of global) {
                lines.push(`- **${e.key}**: ${e.value}`);
            }
        }

        if (project.length > 0) {
            lines.push('\n### This project');
            for (const e of project) {
                lines.push(`- **${e.key}**: ${e.value}`);
            }
        }

        lines.push('\nApply this context automatically — do not re-ask what you already know.');
        return lines.join('\n');
    }

    /**
     * Prompt text sent to the LLM to extract memories from a conversation.
     * Returns structured JSON: Array<{ key, value, scope }>.
     */
    static extractionPrompt(conversationSummary: string): string {
        return `You are a memory extractor. Given this conversation summary, extract facts worth remembering for future sessions.

Extract two types:
- "global": User preferences, coding style, favourite tools/libraries, patterns they always use. Things that apply to ALL projects.
- "project": Project-specific facts — tech stack, architecture, file locations, key decisions, conventions. Things specific to THIS project only.

Rules:
- Only extract clear, stable facts. Skip one-off things.
- Be specific: "uses Tailwind CSS" not "uses a CSS framework".
- Keep values concise (1 sentence max).
- Skip trivial things already obvious from context.
- Return ONLY valid JSON, no markdown, no explanation.

Conversation:
${conversationSummary}

Return format (array, may be empty []):
[{"key":"...", "value":"...", "scope":"global|project"}, ...]`;
    }
}
