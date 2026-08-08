jest.mock('inquirer', () => ({
    __esModule: true,
    default: { prompt: jest.fn() },
}));

import { ConversationCompacter } from '../ConversationCompacter';
import { ChatMessage, ModelClient } from '../../llm/ModelInterface';

function clientWithSummary(summary: string): ModelClient {
    return {
        chat: jest.fn().mockResolvedValue({ content: summary }),
    };
}

describe('ConversationCompacter', () => {
    it('summarizes old tool groups while retaining recent messages intact', async () => {
        const history: ChatMessage[] = [
            { role: 'system', content: 'Stable project instructions' },
            { role: 'user', content: 'Fix the failing build' },
            {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'old-call', type: 'function', function: { name: 'run_shell', arguments: '{"command":"npm test"}' } }],
            },
            { role: 'tool', tool_call_id: 'old-call', name: 'run_shell', content: 'One test failed' },
            { role: 'assistant', content: 'I found the regression.' },
            { role: 'user', content: 'Patch it now' },
            {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'recent-call', type: 'function', function: { name: 'edit_file', arguments: '{"path":"src/app.ts"}' } }],
            },
            { role: 'tool', tool_call_id: 'recent-call', name: 'edit_file', content: 'Updated src/app.ts' },
            { role: 'assistant', content: 'The patch is ready.' },
        ];
        const client = clientWithSummary('## Goal\nFix the build.\n\n## Status\nOne regression identified.');

        const compacted = await new ConversationCompacter().compact(history, client, { keepRecentTurns: 1 });

        expect(compacted[0]).toEqual(history[0]);
        expect(compacted[1].role).toBe('system');
        expect(compacted[1].content).toContain('[Previous Conversation Summary]');
        expect(compacted.slice(2)).toEqual(history.slice(5));

        const prompt = (client.chat as jest.Mock).mock.calls[0][0][0].content as string;
        expect(prompt).toContain('Fix the failing build');
        expect(prompt).toContain('TOOL CALL run_shell');
        expect(prompt).toContain('One test failed');
        expect(prompt).not.toContain('recent-call');
    });

    it('replaces an earlier summary instead of stacking summaries', async () => {
        const history: ChatMessage[] = [
            { role: 'system', content: 'Stable instructions' },
            { role: 'system', content: '[Previous Conversation Summary]\nOld summary' },
            { role: 'user', content: 'Older turn' },
            { role: 'assistant', content: 'Older answer' },
            { role: 'user', content: 'Recent turn' },
            { role: 'assistant', content: 'Recent answer' },
        ];

        const compacted = await new ConversationCompacter().compact(
            history,
            clientWithSummary('Updated summary'),
            { keepRecentTurns: 1 },
        );

        expect(compacted.filter(message => message.content?.startsWith('[Previous Conversation Summary]'))).toHaveLength(1);
        expect(compacted[1].content).toContain('Updated summary');
    });

    it('leaves history unchanged if there is nothing safe to summarize', async () => {
        const history: ChatMessage[] = [
            { role: 'system', content: 'Instructions' },
            { role: 'user', content: 'Only turn' },
            { role: 'assistant', content: 'Only answer' },
        ];
        const client = clientWithSummary('Unused');

        const compacted = await new ConversationCompacter().compact(history, client, { keepRecentTurns: 4 });

        expect(compacted).toBe(history);
        expect(client.chat).not.toHaveBeenCalled();
    });

    it('keeps the original history when summary generation fails', async () => {
        const history: ChatMessage[] = [
            { role: 'user', content: 'Older turn' },
            { role: 'assistant', content: 'Older answer' },
            { role: 'user', content: 'Recent turn' },
        ];
        const client: ModelClient = { chat: jest.fn().mockRejectedValue(new Error('offline')) };
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        const compacted = await new ConversationCompacter().compact(history, client, { keepRecentTurns: 1 });

        expect(compacted).toBe(history);
        errorSpy.mockRestore();
    });
});
