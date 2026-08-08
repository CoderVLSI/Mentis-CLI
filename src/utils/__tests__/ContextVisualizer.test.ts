/**
 * Tests for ContextVisualizer
 */

import { ContextVisualizer, ContextUsage, contextWindowForModel } from '../ContextVisualizer';
import { ChatMessage } from '../../llm/ModelInterface';

describe('ContextVisualizer', () => {
    let visualizer: ContextVisualizer;

    beforeEach(() => {
        visualizer = new ContextVisualizer();
    });

    describe('calculateUsage', () => {
        it('should handle empty history', () => {
            const history: ChatMessage[] = [];
            const usage = visualizer.calculateUsage(history);

            // Includes 2000 char overhead = 500 tokens
            expect(usage.tokens).toBe(500);
            expect(usage.maxTokens).toBe(128000);
            expect(usage).toHaveProperty('percentage');
            expect(usage).toHaveProperty('tokens');
            expect(usage).toHaveProperty('maxTokens');
        });

        it('should calculate tokens for messages', () => {
            const history: ChatMessage[] = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' }
            ];

            const usage = visualizer.calculateUsage(history);

            expect(usage.tokens).toBeGreaterThan(500);
            expect(usage.tokens).toBeLessThan(1000);
            expect(usage.maxTokens).toBe(128000);
        });

        it('should handle large messages', () => {
            const largeContent = 'x'.repeat(10000);
            const history: ChatMessage[] = [
                { role: 'user', content: largeContent }
            ];

            const usage = visualizer.calculateUsage(history);

            expect(usage.tokens).toBeGreaterThan(1500);
        });
    });

    describe('formatBar', () => {
        const usage = (tokens: number, percentage: number): ContextUsage => ({
            tokens,
            percentage,
            maxTokens: 128000,
            usableTokens: 119808,
            reservedTokens: 8192,
            remainingTokens: Math.max(0, 119808 - tokens),
        });

        it('should format bar at low usage', () => {
            const bar = visualizer.formatBar(usage(1000, 5));

            // Check that bar contains expected data (without chalk dependency)
            expect(bar).toContain('5');
            expect(bar).toContain('1k');
            expect(bar).toContain('128');
        });

        it('should format bar at medium usage', () => {
            const bar = visualizer.formatBar(usage(50000, 40));

            expect(bar).toContain('40');
            expect(bar).toContain('50k');
        });

        it('should format bar at high usage', () => {
            const bar = visualizer.formatBar(usage(100000, 80));

            expect(bar).toContain('80');
            expect(bar).toContain('100k');
        });
    });

    describe('shouldCompact', () => {
        it('should return false for low percentage', () => {
            const history: ChatMessage[] = [
                { role: 'user', content: 'small message' }
            ];

            const shouldCompact = visualizer.shouldCompact(history);
            expect(shouldCompact).toBe(false);
        });

        it('should return true at 80% threshold', () => {
            // Create enough content to exceed 80%
            // 80% of 128000 tokens = 102400 tokens = ~409600 chars
            // Subtract 2000 overhead = ~407400 chars needed
            const largeContent = 'x'.repeat(410000);
            const history: ChatMessage[] = [
                { role: 'system', content: largeContent },
                { role: 'user', content: largeContent }
            ];

            const shouldCompact = visualizer.shouldCompact(history);
            expect(shouldCompact).toBe(true);
        });
    });

    describe('setMaxTokens', () => {
        it('should update max tokens', () => {
            visualizer.setMaxTokens(32000);

            const history: ChatMessage[] = [];
            const usage = visualizer.calculateUsage(history);

            expect(usage.maxTokens).toBe(32000);
            expect(usage.percentage).toBeGreaterThan(1); // Should be higher percentage with smaller max
        });
    });

    describe('model-aware budgets', () => {
        it('maps current model families to their context windows', () => {
            expect(contextWindowForModel('gpt-5.6-sol')).toBe(1050000);
            expect(contextWindowForModel('claude-sonnet-5')).toBe(1000000);
            expect(contextWindowForModel('gemini-3-pro')).toBe(1048576);
            expect(contextWindowForModel('unknown-local-model')).toBe(128000);
        });

        it('reserves output tokens before calculating input pressure', () => {
            visualizer.setModel('claude-sonnet-5');
            const current = visualizer.calculateUsage([]);

            expect(current.maxTokens).toBe(1000000);
            expect(current.reservedTokens).toBe(32768);
            expect(current.usableTokens).toBe(967232);
            expect(current.remainingTokens).toBe(current.usableTokens - current.tokens);
        });
    });
});
