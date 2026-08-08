/**
 * ConversationCompacter - safely summarize old turns before the context fills.
 * Keeps recent tool-call groups intact and replaces previous summaries instead
 * of accumulating them forever.
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { ModelClient, ChatMessage } from '../llm/ModelInterface';

const SUMMARY_PREFIX = '[Previous Conversation Summary]';
const MAX_TOOL_RESULT_CHARS = 8000;

export interface CompactionOptions {
    keepSystemMessages?: boolean;
    focusTopic?: string;
    keepRecentTurns?: number;
}

function isPreviousSummary(message: ChatMessage): boolean {
    return message.role === 'system' && (message.content ?? '').startsWith(SUMMARY_PREFIX);
}

function recentTurnStart(history: ChatMessage[], turns: number): number {
    let usersSeen = 0;
    for (let index = history.length - 1; index >= 0; index--) {
        if (history[index].role !== 'user') continue;
        usersSeen++;
        if (usersSeen >= Math.max(1, turns)) return index;
    }
    return 0;
}

function serializeMessage(message: ChatMessage): string {
    const lines: string[] = [`${message.role.toUpperCase()}${message.name ? ` (${message.name})` : ''}:`];
    if (message.content) {
        const content = message.role === 'tool'
            ? message.content.slice(0, MAX_TOOL_RESULT_CHARS)
            : message.content;
        lines.push(content);
        if (message.role === 'tool' && message.content.length > MAX_TOOL_RESULT_CHARS) {
            lines.push(`[tool result truncated from ${message.content.length} characters]`);
        }
    }
    if (message.tool_calls?.length) {
        for (const call of message.tool_calls) {
            lines.push(`TOOL CALL ${call.function.name}: ${call.function.arguments}`);
        }
    }
    return lines.join('\n');
}

export class ConversationCompacter {
    async compact(
        history: ChatMessage[],
        modelClient: ModelClient,
        options: CompactionOptions = {},
    ): Promise<ChatMessage[]> {
        const {
            keepSystemMessages = true,
            focusTopic,
            keepRecentTurns = 4,
        } = options;

        const cutIndex = recentTurnStart(history, keepRecentTurns);
        if (cutIndex === 0) return history;

        const older = history.slice(0, cutIndex);
        const recent = history.slice(cutIndex);
        const stableSystem = keepSystemMessages
            ? older.filter(message => message.role === 'system' && !isPreviousSummary(message))
            : [];
        const toCompact = older.filter(message => message.role !== 'system' || isPreviousSummary(message));
        if (toCompact.length === 0) return history;

        let compactPrompt = `Create a durable handoff summary of the conversation below.

Preserve:
- user goals and acceptance criteria
- decisions, constraints, preferences, and rejected approaches
- exact file paths, symbols, commands, errors, and test results that remain relevant
- files changed and the current implementation state
- unresolved questions, pending approvals, todos, and next steps
- relevant tool calls and outcomes

Do not copy secrets, credentials, tokens, or irrelevant raw logs. Do not invent facts.
Return only the summary, using concise markdown headings and bullets.`;

        if (focusTopic) compactPrompt += `\nFocus especially on: ${focusTopic}`;
        compactPrompt += `\n\n--- CONVERSATION TO COMPACT ---\n\n${toCompact.map(serializeMessage).join('\n\n')}`;

        try {
            const summaryResponse = await modelClient.chat(
                [{ role: 'user', content: compactPrompt }],
                [],
            );
            const summary = summaryResponse.content?.trim();
            if (!summary) return history;

            return [
                ...stableSystem,
                { role: 'system', content: `${SUMMARY_PREFIX}\n${summary}` },
                ...recent,
            ];
        } catch (error) {
            console.error('Compaction failed:', error);
            return history;
        }
    }

    async promptIfCompactNeeded(
        percentage: number,
        history: ChatMessage[],
        modelClient: ModelClient,
        yolo: boolean = false,
        options: CompactionOptions & { threshold?: number; forceAtPercent?: number; autoCompact?: boolean } = {},
    ): Promise<ChatMessage[]> {
        const threshold = options.threshold ?? 80;
        const forceAtPercent = options.forceAtPercent ?? 95;
        if (percentage < threshold) return history;

        const forced = percentage >= forceAtPercent;
        const automatic = yolo || options.autoCompact || forced;
        console.log(chalk.yellow(
            `\n⚠️  Context is ${percentage}% full. ${automatic ? 'Compacting safely…' : 'Compaction is recommended.'}`,
        ));

        if (!automatic) {
            const { shouldCompact } = await inquirer.prompt([{
                type: 'confirm',
                name: 'shouldCompact',
                message: 'Compact older conversation turns now?',
                default: true,
            }]);
            if (!shouldCompact) return history;
        }

        let focusTopic = options.focusTopic;
        if (!automatic && !focusTopic) {
            focusTopic = await inquirer.prompt([{
                type: 'input',
                name: 'focusTopic',
                message: 'Focus on a specific topic? (leave empty for general)',
                default: '',
            }]).then(answer => answer.focusTopic || undefined);
        }

        return this.compact(history, modelClient, { ...options, focusTopic });
    }
}
