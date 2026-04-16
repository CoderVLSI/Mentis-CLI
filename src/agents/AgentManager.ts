/**
 * AgentManager - Discovers and loads agent definitions
 *
 * Agents are loaded from three sources (project wins over global wins over built-in):
 *   1. Built-in:  src/agents/builtinAgents.ts
 *   2. Global:    ~/.mentis/agents/*.md
 *   3. Project:   .mentis/agents/*.md
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { AgentDefinition } from './AgentDefinition';
import { BUILTIN_AGENTS } from './builtinAgents';

export class AgentManager {
    private agents: Map<string, AgentDefinition> = new Map();

    constructor(cwd: string = process.cwd()) {
        this.loadBuiltins();
        this.loadFromDirectory(path.join(os.homedir(), '.mentis', 'agents'));
        this.loadFromDirectory(path.join(cwd, '.mentis', 'agents'));
    }

    private loadBuiltins(): void {
        for (const agent of BUILTIN_AGENTS) {
            this.agents.set(agent.name, agent);
        }
    }

    private loadFromDirectory(dir: string): void {
        if (!fs.existsSync(dir)) return;
        try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const filePath = path.join(dir, file);
                const agent = this.parseAgentFile(filePath);
                if (agent) {
                    this.agents.set(agent.name, agent);
                }
            }
        } catch {
            // Silently ignore unreadable directories
        }
    }

    private parseAgentFile(filePath: string): AgentDefinition | null {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
            if (!match) return null;

            const frontmatter = yaml.parse(match[1]);
            const body = match[2].trim();

            if (!frontmatter?.name || !frontmatter?.description || !body) return null;

            return {
                name: frontmatter.name,
                description: frontmatter.description,
                tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
                systemPrompt: body,
                filePath,
            };
        } catch {
            return null;
        }
    }

    getAgent(name: string): AgentDefinition | undefined {
        return this.agents.get(name);
    }

    listAgents(): AgentDefinition[] {
        return Array.from(this.agents.values());
    }

    /**
     * Human-readable list of all agents for the spawn_agent tool description.
     * This is what the main LLM sees when deciding whether/which to spawn.
     */
    getAgentDescriptions(): string {
        return this.listAgents()
            .map(a => `- ${a.name}: ${a.description}`)
            .join('\n');
    }
}
