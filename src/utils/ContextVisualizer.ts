/**
 * ContextVisualizer - Auto context bar display
 * Shows token usage as a colored progress bar
 */

import chalk from 'chalk';

export interface ContextUsage {
    tokens: number;
    percentage: number;
    maxTokens: number;
    usableTokens: number;
    reservedTokens: number;
    remainingTokens: number;
}

const DEFAULT_CONTEXT_WINDOW = 128000;

export function contextWindowForModel(model: string): number {
    const id = model.toLowerCase();
    if (/^gpt-5\.6(?:-|$)/.test(id)) return 1_050_000;
    if (/^gpt-(?:5|4\.1)(?:-|$)/.test(id)) return 1_000_000;
    if (/^claude-(?:fable-5|opus-(?:5|4-[678])|sonnet-(?:5|4-6))/.test(id)) return 1_000_000;
    if (/^claude-haiku-4-5/.test(id)) return 200_000;
    if (/^gemini-(?:3|2\.5)(?:\.|-|$)/.test(id)) return 1_048_576;
    return DEFAULT_CONTEXT_WINDOW;
}

export class ContextVisualizer {
    private maxTokens: number = DEFAULT_CONTEXT_WINDOW;
    private reservedTokens: number;

    constructor(maxTokens?: number, reservedTokens?: number) {
        if (maxTokens) {
            this.maxTokens = maxTokens;
        }
        this.reservedTokens = reservedTokens ?? this.defaultReserve(this.maxTokens);
    }

    /**
     * Calculate approximate token count from text
     * Rough estimate: ~4 characters per token
     */
    private estimateTokens(text: string): number {
        if (!text) return 0;
        // Rough estimation: ~4 characters per token for English text
        return Math.ceil(text.length / 4);
    }

    /**
     * Calculate total tokens from message history
     */
    calculateUsage(history: any[]): ContextUsage {
        let totalChars = 0;

        for (const msg of history) {
            if (msg.content) {
                totalChars += msg.content.length;
            }
            if (msg.tool_calls) {
                totalChars += JSON.stringify(msg.tool_calls).length;
            }
        }

        // Add overhead for system prompt, skills, etc.
        totalChars += 2000;

        // Rough estimation: ~4 characters per token
        const tokens = Math.ceil(totalChars / 4);
        const usableTokens = Math.max(1, this.maxTokens - this.reservedTokens);
        const percentage = Math.min(100, Math.round((tokens / usableTokens) * 100));
        const remainingTokens = Math.max(0, usableTokens - tokens);

        return {
            tokens,
            percentage,
            maxTokens: this.maxTokens,
            usableTokens,
            reservedTokens: this.reservedTokens,
            remainingTokens,
        };
    }

    /**
     * Format the context bar for display
     */
    formatBar(usage: ContextUsage): string {
        const { percentage, tokens, maxTokens } = usage;

        // Create progress bar (20 chars wide)
        const filled = Math.round(percentage / 5);
        const empty = 20 - filled;

        let bar: string;
        if (percentage < 60) {
            bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
        } else if (percentage < 80) {
            bar = chalk.yellow('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
        } else {
            bar = chalk.red('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
        }

        const tokensK = Math.round(tokens / 1000);
        const maxTokensK = Math.round(maxTokens / 1000);

        return `${bar} ${percentage}% | ${tokensK}k/${maxTokensK} tokens`;
    }

    /**
     * Get the context bar string for current history
     */
    getContextBar(history: any[]): string {
        const usage = this.calculateUsage(history);
        return this.formatBar(usage);
    }

    /**
     * Check if context is at warning threshold (>=80%)
     */
    shouldCompact(history: any[]): boolean {
        const usage = this.calculateUsage(history);
        return usage.percentage >= 80;
    }

    /**
     * Set custom max tokens (for different models)
     */
    setMaxTokens(max: number): void {
        this.maxTokens = max;
        this.reservedTokens = this.defaultReserve(max);
    }

    setModel(model: string): void {
        this.setMaxTokens(contextWindowForModel(model));
    }

    private defaultReserve(maxTokens: number): number {
        return Math.min(32768, Math.max(8192, Math.round(maxTokens * 0.05)));
    }
}
