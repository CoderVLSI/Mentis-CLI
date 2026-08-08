import axios from 'axios';
import { OpenAIClient } from '../OpenAIClient';

jest.mock('axios', () => ({
    __esModule: true,
    default: { post: jest.fn() },
}));

const post = axios.post as jest.Mock;

describe('OpenAIClient reasoning configuration', () => {
    beforeEach(() => {
        post.mockReset();
        post.mockResolvedValue({
            data: {
                choices: [{ message: { content: 'ok' } }],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
            },
        });
    });

    it('uses current Chat Completions fields for GPT-5 reasoning models', async () => {
        const client = new OpenAIClient('https://api.openai.com/v1', 'key', 'gpt-5.6-sol', 'xhigh');
        await client.chat([{ role: 'user', content: 'hello' }]);

        const body = post.mock.calls[0][1];
        expect(body.reasoning_effort).toBe('xhigh');
        expect(body.max_completion_tokens).toBe(32768);
        expect(body.max_tokens).toBeUndefined();
        expect(body.temperature).toBeUndefined();
    });

    it('maps effort through Gemini OpenAI compatibility', async () => {
        const client = new OpenAIClient(
            'https://generativelanguage.googleapis.com/v1beta/openai/',
            'key',
            'gemini-3.6-flash',
            'medium',
        );
        await client.chat([{ role: 'user', content: 'hello' }]);

        const body = post.mock.calls[0][1];
        expect(body.reasoning_effort).toBe('medium');
        expect(body.max_tokens).toBe(8096);
        expect(body.temperature).toBeUndefined();
    });

    it('keeps legacy/non-reasoning requests backward compatible', async () => {
        const client = new OpenAIClient('https://example.test/v1', 'key', 'custom-model');
        await client.chat([{ role: 'user', content: 'hello' }]);

        const body = post.mock.calls[0][1];
        expect(body.reasoning_effort).toBeUndefined();
        expect(body.max_tokens).toBe(8096);
        expect(body.temperature).toBe(0.7);
    });
});
