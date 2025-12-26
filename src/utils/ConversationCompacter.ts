/**
 * ConversationCompacter - Compact conversation to save tokens
 * Summarizes conversation history while preserving important context
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { ModelClient, ChatMessage } from '../llm/ModelInterface';

export class ConversationCompacter {
    /**
     * Compact conversation history using AI
     */
    async compact(
        history: ChatMessage[],
        modelClient: ModelClient,
        options?: {
            keepSystemMessages?: boolean;
            focusTopic?: string;
        }
    ): Promise<ChatMessage[]> {
        const { keepSystemMessages = true, focusTopic } = options || {};

        // Preserve system-style messages
        const preserved: ChatMessage[] = [];
        const toCompact: ChatMessage[] = [];

        for (const msg of history) {
            if (msg.role === 'system' || msg.role === 'tool') {
                preserved.push(msg);
            } else {
                toCompact.push(msg);
            }
        }

        if (toCompact.length === 0) {
            return history;
        }

        // Create compaction prompt
        let compactPrompt = 'Please summarize the following conversation into a concise overview. ';
        compactPrompt += 'Include:\n';
        compactPrompt += '- The main topic/problem being discussed\n';
        compactPrompt += '- Key decisions made\n';
        compactPrompt += '- Important technical details\n';
        compactPrompt += '- Current status/next steps\n\n';

        if (focusTopic) {
            compactPrompt += `Focus primarily on content related to: ${focusTopic}\n\n`;
        }

        compactPrompt += 'Return ONLY the summary, no other text.\n\n---\n\n';

        for (const msg of toCompact.slice(-10)) { // Last 10 messages for context
            compactPrompt += `${msg.role.toUpperCase()}: ${msg.content}\n\n`;
        }

        try {
            // Call AI to summarize
            const summaryResponse = await modelClient.chat(
                [{ role: 'user', content: compactPrompt }],
                []
            );

            const summary = summaryResponse.content;

            // Create new compacted history
            const newHistory: ChatMessage[] = [...preserved];

            // Add summary as a system message for context
            newHistory.push({
                role: 'system',
                content: `[Previous Conversation Summary]\n${summary}`
            });

            return newHistory;
        } catch (error) {
            console.error('Compaction failed:', error);
            return history; // Return original if compaction fails
        }
    }

    /**
     * Prompt user to compact when threshold is reached
     */
    async promptIfCompactNeeded(
        percentage: number,
        history: ChatMessage[],
        modelClient: ModelClient
    ): Promise<ChatMessage[]> {
        if (percentage < 80) {
            return history;
        }

        console.log(chalk.yellow(`\n⚠️  Context is ${percentage}% full. Consider compacting to save tokens.`));

        const { shouldCompact } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'shouldCompact',
                message: 'Compact conversation now?',
                default: true
            }
        ]);

        if (!shouldCompact) {
            return history;
        }

        const { focusTopic } = await inquirer.prompt([
            {
                type: 'input',
                name: 'focusTopic',
                message: 'Focus on specific topic? (leave empty for general)',
                default: ''
            }
        ]);

        return await this.compact(history, modelClient, {
            keepSystemMessages: true,
            focusTopic: focusTopic || undefined
        });
    }
}
