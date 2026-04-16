/**
 * SubAgent - A specialized agent spawned by the main agent
 *
 * Runs its own LLM tool loop with:
 *   - A specialised system prompt (from the agent definition)
 *   - A restricted tool set (only tools listed in definition.tools)
 *   - An isolated conversation history (empty at start)
 *
 * Returns the final text response to the caller.
 */

import chalk from 'chalk';
import { AgentDefinition } from './AgentDefinition';
import { ModelClient, ChatMessage } from '../llm/ModelInterface';
import { Tool } from '../tools/Tool';

/** Cap turns to prevent runaway loops */
const MAX_AGENT_TURNS = 15;

export class SubAgent {
    private definition: AgentDefinition;
    private modelClient: ModelClient;
    private allTools: Tool[];

    constructor(definition: AgentDefinition, modelClient: ModelClient, allTools: Tool[]) {
        this.definition = definition;
        this.modelClient = modelClient;
        this.allTools = allTools;
    }

    async run(task: string): Promise<string> {
        const availableTools = this.filterTools();

        const history: ChatMessage[] = [
            { role: 'system', content: this.definition.systemPrompt } as any,
            { role: 'user', content: task },
        ];

        const preview = task.length > 80 ? task.slice(0, 80) + '…' : task;
        console.log(chalk.blue(`  ↳ ${chalk.bold(this.definition.name)}: ${preview}`));

        const toolSchemas = availableTools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as any,
            },
        }));

        let turns = 0;

        try {
            let response: any = await this.modelClient.chat(history, toolSchemas as any);

            while (response.tool_calls && response.tool_calls.length > 0 && turns < MAX_AGENT_TURNS) {
                turns++;

                history.push({
                    role: 'assistant',
                    content: response.content ?? '',
                    tool_calls: response.tool_calls,
                } as any);

                for (const toolCall of response.tool_calls) {
                    const toolName: string = toolCall.function?.name ?? toolCall.name;
                    const rawArgs: string = toolCall.function?.arguments ?? toolCall.arguments ?? '{}';

                    const tool = availableTools.find(t => t.name === toolName);
                    let result: string;

                    if (!tool) {
                        result = `Error: Tool '${toolName}' is not available to the ${this.definition.name} agent.`;
                    } else {
                        try {
                            const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs;
                            const raw = await tool.execute(args);
                            result = typeof raw === 'string' ? raw : JSON.stringify(raw);
                        } catch (e: any) {
                            result = `Error running ${toolName}: ${e.message}`;
                        }
                    }

                    console.log(chalk.dim(`    • ${toolName}`));

                    history.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolName,
                        content: result,
                    } as any);
                }

                response = await this.modelClient.chat(history, toolSchemas as any);
            }

            if (turns >= MAX_AGENT_TURNS) {
                return `[${this.definition.name}] Stopped after ${MAX_AGENT_TURNS} turns. Partial result:\n${response.content ?? ''}`;
            }

            console.log(chalk.dim(`  ↲ ${this.definition.name} done (${turns} turn${turns === 1 ? '' : 's'})`));
            return response.content ?? `[${this.definition.name}] returned no content.`;
        } catch (error: any) {
            return `[${this.definition.name}] Error: ${error.message}`;
        }
    }

    private filterTools(): Tool[] {
        if (!this.definition.tools || this.definition.tools.length === 0) {
            return [];
        }
        const allowed = new Set(this.definition.tools);
        return this.allTools.filter(t => allowed.has(t.name));
    }
}
