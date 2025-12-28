/**
 * Tests for ContextVisualizer
 */

import { ContextVisualizer } from '../ContextVisualizer';
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
        it('should format bar at low usage', () => {
            const usage = { tokens: 1000, percentage: 5, maxTokens: 128000 };
            const bar = visualizer.formatBar(usage);

            // Check that bar contains expected data (without chalk dependency)
            expect(bar).toContain('5');
            expect(bar).toContain('1k');
            expect(bar).toContain('128');
        });

        it('should format bar at medium usage', () => {
            const usage = { tokens: 50000, percentage: 40, maxTokens: 128000 };
            const bar = visualizer.formatBar(usage);

            expect(bar).toContain('40');
            expect(bar).toContain('50k');
        });

        it('should format bar at high usage', () => {
            const usage = { tokens: 100000, percentage: 80, maxTokens: 128000 };
            const bar = visualizer.formatBar(usage);

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
});
