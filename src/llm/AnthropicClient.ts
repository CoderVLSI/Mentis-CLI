/**
 * AnthropicClient - Native Anthropic SDK client with prompt caching
 *
 * Uses the Anthropic SDK directly (not via OpenAI-compatible endpoint) to
 * enable prompt caching, which can cut costs by 80-90% on long sessions by
 * caching the system prompt and conversation history checkpoints.
 *
 * Caching strategy:
 *   1. System prompt (project instructions + skills + mode) — always cached
 *   2. Conversation history — cache_control added every CACHE_INTERVAL messages
 *      so that as the conversation grows, earlier chunks stay cached
 *
 * Cache hits are shown in the token usage display.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ModelClient, ChatMessage, ModelResponse, ToolDefinition } from './ModelInterface';
import { buildSystemPrompt, ToolSummary } from './SystemPrompt';
import { EffortLevel, getMaxOutputTokens } from './ModelCatalog';

const CACHE_INTERVAL = 10;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export class AnthropicClient implements ModelClient {
    private client: Anthropic;
    private model: string;
    private effort?: EffortLevel;
    private lastTools?: ToolDefinition[];

    constructor(apiKey: string, model: string, effort?: EffortLevel) {
        this.client = new Anthropic({ apiKey });
        this.model = model;
        this.effort = effort;
    }

    async chat(
        messages: ChatMessage[],
        tools?: ToolDefinition[],
        signal?: AbortSignal
    ): Promise<ModelResponse> {
        this.lastTools = tools;
        const { systemBlocks, anthropicMessages } = this.convertMessages(messages);

        const params: Anthropic.MessageCreateParamsNonStreaming = {
            model: this.model,
            max_tokens: getMaxOutputTokens(this.effort),
            system: systemBlocks,
            messages: anthropicMessages,
        };

        if (this.effort) {
            const effortParams = params as any;
            effortParams.thinking = { type: 'adaptive' };
            effortParams.output_config = { effort: this.effort };
        }

        if (tools && tools.length > 0) {
            params.tools = tools.map(t => ({
                name: t.function.name,
                description: t.function.description,
                input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
            }));
        }

        // Hard timeout racing with user cancel
        const tc = new AbortController();
        const timer = setTimeout(() => tc.abort(), REQUEST_TIMEOUT_MS);
        const onUser = () => tc.abort();
        signal?.addEventListener('abort', onUser);

        try {
            return await this.createWithRetry(params, tc.signal);
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onUser);
        }
    }

    private async createWithRetry(
        params: Anthropic.MessageCreateParamsNonStreaming,
        signal: AbortSignal,
        attempt = 0,
    ): Promise<ModelResponse> {
        try {
            const response = await this.client.messages.create(params, {
                signal: signal as RequestInit['signal'],
                headers: { 'anthropic-beta': 'prompt-caching-2024-07-31,computer-use-2024-10-22' },
            } as any);

            let content = '';
            const toolCalls: ModelResponse['tool_calls'] = [];

            for (const block of response.content) {
                if (block.type === 'text') {
                    content += block.text;
                } else if (block.type === 'tool_use') {
                    toolCalls.push({
                        id: block.id,
                        type: 'function',
                        function: { name: block.name, arguments: JSON.stringify(block.input) },
                    });
                }
            }

            const usage = response.usage as any;
            return {
                content,
                tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                usage: {
                    input_tokens: usage.input_tokens ?? 0,
                    output_tokens: usage.output_tokens ?? 0,
                    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
                    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
                } as any,
            };
        } catch (error: any) {
            if (signal.aborted || error.name === 'AbortError' || error.message?.includes('cancel')) {
                throw new Error('Request cancelled by user');
            }
            // Retry on rate limits and transient errors
            const status = error.status ?? error.response?.status;
            const retryable = status === 429 || status === 529 || status === 503 || status === 502;
            if (attempt < MAX_RETRIES && retryable) {
                const delay = Math.min(1000 * 2 ** attempt, 16000);
                await sleep(delay);
                return this.createWithRetry(params, signal, attempt + 1);
            }
            throw new Error(error.message ?? `Anthropic API error ${status}`);
        }
    }

    private convertMessages(messages: ChatMessage[]): {
        systemBlocks: Anthropic.TextBlockParam[];
        anthropicMessages: Anthropic.MessageParam[];
    } {
        // Separate system messages; merge them into one cached system block
        const systemParts = messages
            .filter(m => m.role === 'system')
            .map(m => m.content ?? '')
            .filter(Boolean);

        const toolSummaries: ToolSummary[] = (this.lastTools ?? []).map(t => ({
            name: t.function.name,
            description: t.function.description ?? '',
        }));
        const systemText = buildSystemPrompt(systemParts.join('\n\n') || undefined, toolSummaries);

        // Always cache the system prompt — it's expensive to re-process
        const systemBlocks: Anthropic.TextBlockParam[] = [
            { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
        ];

        const nonSystem = messages.filter(m => m.role !== 'system');
        const anthropicMessages = this.buildMessages(nonSystem);

        return { systemBlocks, anthropicMessages };
    }

    private buildMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
        const result: Anthropic.MessageParam[] = [];

        // Cache anchors: every CACHE_INTERVAL messages from the end (excluding last)
        const cacheSet = new Set<number>();
        for (let i = messages.length - 1 - CACHE_INTERVAL; i >= 0; i -= CACHE_INTERVAL) {
            cacheSet.add(i);
        }

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const addCache = cacheSet.has(i);

            if (msg.role === 'assistant') {
                if (msg.tool_calls && msg.tool_calls.length > 0) {
                    const content: Anthropic.ContentBlock[] = [];
                    if (msg.content) content.push({ type: 'text', text: msg.content } as any);
                    for (const tc of msg.tool_calls) {
                        content.push({
                            type: 'tool_use',
                            id: tc.id,
                            name: tc.function.name,
                            input: this.parseArgs(tc.function.arguments),
                        } as any);
                    }
                    result.push({ role: 'assistant', content });
                } else {
                    const block: any = { type: 'text', text: msg.content ?? '' };
                    if (addCache) block.cache_control = { type: 'ephemeral' };
                    result.push({ role: 'assistant', content: [block] });
                }
            } else if (msg.role === 'tool') {
                // Tool results must be in a user-role message
                const toolResult: any = {
                    type: 'tool_result',
                    tool_use_id: msg.tool_call_id,
                    content: msg.content ?? '',
                };
                if (addCache) toolResult.cache_control = { type: 'ephemeral' };

                const prev = result[result.length - 1];
                if (prev?.role === 'user' && Array.isArray(prev.content)) {
                    (prev.content as any[]).push(toolResult);
                } else {
                    result.push({ role: 'user', content: [toolResult] });
                }
            } else if (msg.role === 'user') {
                const block: any = { type: 'text', text: msg.content ?? '' };
                if (addCache) block.cache_control = { type: 'ephemeral' };
                result.push({ role: 'user', content: [block] });
            }
        }

        return result;
    }

    private parseArgs(args: string): unknown {
        try { return JSON.parse(args || '{}'); } catch { return {}; }
    }
}
