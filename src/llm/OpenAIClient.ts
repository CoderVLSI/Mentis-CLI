import axios from 'axios';
import { ModelClient, ChatMessage, ModelResponse, ToolDefinition } from './ModelInterface';

export class OpenAIClient implements ModelClient {
    private baseUrl: string;
    private apiKey: string;
    private model: string;

    constructor(baseUrl: string, apiKey: string, model: string) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.apiKey = apiKey;
        this.model = model;
    }

    async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ModelResponse> {
        try {
            const requestBody: any = {
                model: this.model,
                messages: [
                    { role: 'system', content: 'You are Mentis, an expert AI coding assistant. You help users write code, debug issues, and explain concepts. You are concise, accurate, and professional.' },
                    ...messages
                ],
                temperature: 0.7,
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
                }
            );

            const choice = response.data.choices[0];
            return {
                content: choice.message.content,
                tool_calls: choice.message.tool_calls,
                usage: response.data.usage ? {
                    promptTokens: response.data.usage.prompt_tokens,
                    completionTokens: response.data.usage.completion_tokens,
                    totalTokens: response.data.usage.total_tokens
                } : undefined
            };
        } catch (error: any) {
            console.error('Error calling model API:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            throw error;
        }
    }
}
