import axios, { AxiosError } from 'axios';
import { ModelClient, ChatMessage, ModelResponse, ToolDefinition } from './ModelInterface';
import { buildSystemPrompt, ToolSummary } from './SystemPrompt';

const REQUEST_TIMEOUT_MS = 120_000; // 2 min hard timeout per request
const MAX_RETRIES = 3;

/** Race user-cancel signal against a hard timeout. */
function makeSignal(userSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
    const tc = new AbortController();
    const timer = setTimeout(() => tc.abort(new Error('Request timed out after 2 minutes')), REQUEST_TIMEOUT_MS);

    const onUser = () => tc.abort(new Error('Request cancelled by user'));
    userSignal?.addEventListener('abort', onUser);

    return {
        signal: tc.signal,
        cleanup: () => {
            clearTimeout(timer);
            userSignal?.removeEventListener('abort', onUser);
        },
    };
}

function isRetryable(err: AxiosError): boolean {
    const status = err.response?.status;
    if (status === 429 || status === 503 || status === 502 || status === 504) return true;
    const code = (err as any).code;
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') return true;
    return false;
}

async function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}

export class OpenAIClient implements ModelClient {
    private baseUrl: string;
    private apiKey: string;
    private model: string;

    constructor(baseUrl: string, apiKey: string, model: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.apiKey = apiKey;
        this.model = model;
    }

    async chat(messages: ChatMessage[], tools?: ToolDefinition[], signal?: AbortSignal): Promise<ModelResponse> {
        const { signal: combinedSignal, cleanup } = makeSignal(signal);

        try {
            return await this.chatWithRetry(messages, tools, combinedSignal);
        } finally {
            cleanup();
        }
    }

    private async chatWithRetry(
        messages: ChatMessage[],
        tools: ToolDefinition[] | undefined,
        signal: AbortSignal,
        attempt = 0,
    ): Promise<ModelResponse> {
        try {
            return await this.doRequest(messages, tools, signal);
        } catch (err: any) {
            // Never retry on cancellation or timeout
            if (err.message === 'Request cancelled by user' || err.message?.includes('timed out')) throw err;
            if (signal.aborted) throw new Error('Request cancelled by user');

            if (attempt < MAX_RETRIES && isRetryable(err as AxiosError)) {
                const waitMs = Math.min(1000 * 2 ** attempt, 16000); // 1s, 2s, 4s, 8s...
                const retryAfter = (err as AxiosError).response?.headers?.['retry-after'];
                const delay = retryAfter ? parseInt(retryAfter) * 1000 : waitMs;
                await sleep(delay);
                return this.chatWithRetry(messages, tools, signal, attempt + 1);
            }

            // Surface a clean error message
            const status = (err as AxiosError).response?.status;
            const data = (err as AxiosError).response?.data as any;
            const detail = data?.error?.message ?? data?.message ?? err.message;
            throw new Error(status ? `API error ${status}: ${detail}` : detail);
        }
    }

    private async doRequest(
        messages: ChatMessage[],
        tools: ToolDefinition[] | undefined,
        signal: AbortSignal,
    ): Promise<ModelResponse> {
        // Separate system messages from conversation
        const systemParts = messages.filter(m => m.role === 'system').map(m => m.content ?? '');
        const conversation = messages.filter(m => m.role !== 'system');

        const toolSummaries: ToolSummary[] = (tools ?? []).map(t => ({
            name: t.function.name,
            description: t.function.description ?? '',
        }));
        const systemContent = buildSystemPrompt(systemParts.join('\n\n') || undefined, toolSummaries);

        const requestBody: any = {
            model: this.model,
            max_tokens: 8096,
            temperature: 0.7,
            messages: [
                { role: 'system', content: systemContent },
                ...conversation,
            ],
        };

        if (tools && tools.length > 0) {
            requestBody.tools = tools;
            requestBody.tool_choice = 'auto';
        }

        const response = await axios.post(
            `${this.baseUrl}/chat/completions`,
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                signal,
                timeout: REQUEST_TIMEOUT_MS,
            },
        );

        const choice = response.data.choices[0];
        return {
            content: choice.message?.content ?? '',
            tool_calls: choice.message?.tool_calls,
            usage: {
                input_tokens: response.data.usage?.prompt_tokens ?? 0,
                output_tokens: response.data.usage?.completion_tokens ?? 0,
            },
        };
    }
}
