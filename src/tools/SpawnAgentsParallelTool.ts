/**
 * SpawnAgentsParallelTool - Run multiple specialist agents concurrently
 *
 * Unlike spawn_agent (sequential), this tool runs all requested agents via
 * Promise.all() so they execute in parallel. Use this when you have 2+
 * independent tasks that don't need each other's results to proceed.
 *
 * Example: simultaneously run web-researcher for docs + code-reviewer for
 * current diff — both complete in the time of the slower one, not the sum.
 */

import chalk from 'chalk';
import { Tool } from './Tool';
import { AgentManager } from '../agents/AgentManager';
import { SubAgent } from '../agents/SubAgent';
import { ModelClient } from '../llm/ModelInterface';

interface ParallelTask {
    agent_name: string;
    task: string;
    /** Optional label shown in the output heading */
    label?: string;
}

export class SpawnAgentsParallelTool implements Tool {
    name = 'spawn_agents_parallel';
    description: string;

    parameters = {
        type: 'object',
        properties: {
            agents: {
                type: 'array',
                description: 'List of independent agent tasks to run simultaneously.',
                items: {
                    type: 'object',
                    properties: {
                        agent_name: {
                            type: 'string',
                            description: 'Specialist agent name (e.g. web-researcher, code-reviewer).',
                        },
                        task: {
                            type: 'string',
                            description: 'Self-contained task. Include all context — agents share nothing.',
                        },
                        label: {
                            type: 'string',
                            description: 'Short label for this result in the output (optional).',
                        },
                    },
                    required: ['agent_name', 'task'],
                },
            },
        },
        required: ['agents'],
    };

    private agentManager: AgentManager;
    private modelClient: ModelClient;
    private allToolsProvider: () => Tool[];

    constructor(
        agentManager: AgentManager,
        modelClient: ModelClient,
        allToolsProvider: () => Tool[]
    ) {
        this.agentManager = agentManager;
        this.modelClient = modelClient;
        this.allToolsProvider = allToolsProvider;

        this.description = [
            'Run multiple specialist agents IN PARALLEL and return all results.',
            'More efficient than calling spawn_agent multiple times when tasks are independent.',
            '',
            'Available agents:',
            this.agentManager.getAgentDescriptions(),
            '',
            'Use when 2+ tasks are independent and can run simultaneously.',
            'Each agent gets its own isolated context — they cannot communicate.',
        ].join('\n');
    }

    async execute(args: { agents: ParallelTask[] }): Promise<string> {
        if (!args.agents?.length) {
            return 'Error: No agent tasks provided.';
        }

        const count = args.agents.length;
        console.log(chalk.blue(`  ⚡ Spawning ${count} agent${count > 1 ? 's' : ''} in parallel…`));

        const startMs = Date.now();

        const results = await Promise.all(
            args.agents.map(async ({ agent_name, task, label }) => {
                const definition = this.agentManager.getAgent(agent_name);
                if (!definition) {
                    const available = this.agentManager.listAgents().map(a => a.name).join(', ');
                    return `## ${label ?? agent_name}\nError: Unknown agent '${agent_name}'. Available: ${available}`;
                }

                const subAgent = new SubAgent(definition, this.modelClient, this.allToolsProvider());
                const result = await subAgent.run(task);
                return `## ${label ?? agent_name}\n${result}`;
            })
        );

        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(chalk.dim(`  ⚡ All ${count} agents completed in ${elapsed}s`));

        return results.join('\n\n---\n\n');
    }
}
