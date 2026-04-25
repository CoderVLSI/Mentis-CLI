/**
 * SpawnAgentTool - Allows the main agent to spawn a specialized subagent
 *
 * Main LLM calls this with:
 *   agent_name  — which specialist to invoke
 *   task        — clear, self-contained task description
 *
 * The subagent runs its own tool loop and returns a final text response,
 * which is delivered back to the main LLM as the tool result.
 */

import { Tool } from './Tool';
import { AgentManager } from '../agents/AgentManager';
import { SubAgent } from '../agents/SubAgent';
import { ModelClient } from '../llm/ModelInterface';

export class SpawnAgentTool implements Tool {
    name = 'spawn_agent';
    description: string;
    parameters = {
        type: 'object',
        properties: {
            agent_name: {
                type: 'string',
                description: 'Name of the specialist agent to spawn (e.g. web-researcher, code-explorer).',
            },
            task: {
                type: 'string',
                description: 'Clear, self-contained task for the agent. The agent has no other context — include all needed details.',
            },
        },
        required: ['agent_name', 'task'],
    };

    private agentManager: AgentManager;
    private modelClient: ModelClient;
    private allToolsProvider: () => Tool[];

    constructor(agentManager: AgentManager, modelClient: ModelClient, allToolsProvider: () => Tool[]) {
        this.agentManager = agentManager;
        this.modelClient = modelClient;
        this.allToolsProvider = allToolsProvider;
        this.description = this.buildDescription();
    }

    private buildDescription(): string {
        return [
            'Spawn a specialized subagent to handle a specific task.',
            'The subagent has its own restricted toolset and isolated context, and returns a final text result.',
            '',
            'Available agents:',
            this.agentManager.getAgentDescriptions(),
            '',
            'Use when a task fits a specialist better than handling it yourself.',
            'Provide a clear, self-contained task — the subagent has no access to your conversation.',
        ].join('\n');
    }

    async execute(args: { agent_name: string; task: string }): Promise<string> {
        const agent = this.agentManager.getAgent(args.agent_name);
        if (!agent) {
            const available = this.agentManager.listAgents().map(a => a.name).join(', ');
            return `Error: Unknown agent '${args.agent_name}'. Available: ${available}`;
        }

        const subAgent = new SubAgent(agent, this.modelClient, this.allToolsProvider());
        return subAgent.run(args.task);
    }
}
