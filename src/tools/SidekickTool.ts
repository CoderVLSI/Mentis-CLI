/**
 * SidekickTool - Second-opinion consultation when the main agent is confused
 *
 * When the main agent is uncertain about a library, API, error, or approach,
 * it calls this tool with a description of its confusion. The sidekick agent:
 *
 *   1. Searches the web for relevant docs, Stack Overflow answers, GitHub issues
 *   2. Reads local code files if the confusion is codebase-specific
 *   3. Returns a focused, actionable clarification
 *
 * This is different from spawn_agent (task delegation) — it's specifically
 * for resolving uncertainty before or during task execution.
 *
 * Mirrors Claude Code's behaviour of automatically searching when stuck.
 */

import chalk from 'chalk';
import { Tool } from './Tool';
import { AgentManager } from '../agents/AgentManager';
import { SubAgent } from '../agents/SubAgent';
import { ModelClient } from '../llm/ModelInterface';

export class SidekickTool implements Tool {
    name = 'ask_sidekick';
    description = [
        'Ask a research sidekick for help when you are confused or uncertain.',
        'Use this when you are unsure about:',
        '  - How a library, API, or framework works',
        '  - What an error message means',
        '  - The best approach for a problem',
        '  - What a piece of code does',
        'The sidekick will search documentation, Stack Overflow, and your codebase to clarify.',
        'Do not use this for delegating tasks — use spawn_agent for that.',
    ].join('\n');

    parameters = {
        type: 'object',
        properties: {
            confused_about: {
                type: 'string',
                description: 'Describe specifically what you are confused or uncertain about.',
            },
            context: {
                type: 'string',
                description: 'Relevant code snippet, error message, or situation providing context (optional but recommended).',
            },
            search_type: {
                type: 'string',
                enum: ['web', 'codebase', 'both'],
                description: 'Where to search: web (docs/SO), codebase (local files), or both. Defaults to "both".',
            },
        },
        required: ['confused_about'],
    };

    private agentManager: AgentManager;
    private modelClient: ModelClient;
    private allToolsProvider: () => Tool[];

    constructor(agentManager: AgentManager, modelClient: ModelClient, allToolsProvider: () => Tool[]) {
        this.agentManager = agentManager;
        this.modelClient = modelClient;
        this.allToolsProvider = allToolsProvider;
    }

    async execute(args: {
        confused_about: string;
        context?: string;
        search_type?: 'web' | 'codebase' | 'both';
    }): Promise<string> {
        const searchType = args.search_type ?? 'both';

        const sidekickDef = this.agentManager.getAgent('sidekick');
        if (!sidekickDef) {
            return 'Error: Sidekick agent not found. Ensure builtinAgents includes "sidekick".';
        }

        // Build a focused task for the sidekick
        const task = this.buildTask(args.confused_about, args.context, searchType);

        console.log(chalk.magenta(`  🤔 Consulting sidekick: ${args.confused_about.slice(0, 70)}…`));

        const subAgent = new SubAgent(sidekickDef, this.modelClient, this.allToolsProvider());
        const result = await subAgent.run(task);

        console.log(chalk.dim('  💡 Sidekick responded'));
        return result;
    }

    private buildTask(
        confusedAbout: string,
        context: string | undefined,
        searchType: string
    ): string {
        const lines = [
            `I need your help understanding something. I am confused about:`,
            `"${confusedAbout}"`,
            '',
        ];

        if (context) {
            lines.push('Context / relevant code or error:');
            lines.push('```');
            lines.push(context.slice(0, 2000)); // cap context size
            lines.push('```');
            lines.push('');
        }

        if (searchType === 'web') {
            lines.push('Please search the web for documentation or examples to clarify this.');
        } else if (searchType === 'codebase') {
            lines.push('Please search the local codebase to understand how this is used here.');
        } else {
            lines.push('Please search both the web (docs/Stack Overflow) and the local codebase to clarify this.');
        }

        lines.push('');
        lines.push('Return a concise, actionable answer — focus on what I need to know to proceed.');

        return lines.join('\n');
    }
}
