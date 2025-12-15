import Anthropic from '@anthropic-ai/sdk';
import { ModelClient, ChatMessage, ModelResponse, ToolDefinition } from './ModelInterface';

export class AnthropicClient implements ModelClient {
    private client: Anthropic;
    private model: string;

    constructor(apiKey: string, model: string) {
        this.client = new Anthropic({
            apiKey: apiKey
        });
        this.model = model;
    }

    async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ModelResponse> {
        try {
            // Convert messages to Anthropic format
            // Anthropic expects system message to be separate, not in the messages array
            let systemMessage = 'You are Mentis, an expert AI coding assistant. You help users write code, debug issues, and explain concepts. You are concise, accurate, and professional.';

            const anthropicMessages: Anthropic.MessageParam[] = [];

            for (const msg of messages) {
                if (msg.role === 'system') {
                    systemMessage = msg.content || systemMessage;
                } else if (msg.role === 'tool') {
                    // Anthropic uses 'tool_result' role blocks within user messages usually, but for SDK:
                    // role: "user", content: [ { type: "tool_result", ... } ]
                    // We need to handle the conversion carefully.
                    // For simplicity in this v1, if we receive a 'tool' role, we map it to user with tool_result block
                    anthropicMessages.push({
                        role: 'user',
                        content: [
                            {
                                type: 'tool_result',
                                tool_use_id: msg.tool_call_id!,
                                content: msg.content || ''
                            }
                        ]
                    });
                } else if (msg.role === 'assistant') {
                    // Handle tool calls in assistant message
                    if (msg.tool_calls && msg.tool_calls.length > 0) {
                        const contentBlocks: Anthropic.ContentBlockParam[] = [];
                        if (msg.content) {
                            contentBlocks.push({ type: 'text', text: msg.content });
                        }
                        for (const call of msg.tool_calls) {
                            contentBlocks.push({
                                type: 'tool_use',
                                id: call.id,
                                name: call.function.name,
                                input: JSON.parse(call.function.arguments)
                            });
                        }
                        anthropicMessages.push({
                            role: 'assistant',
                            content: contentBlocks
                        });
                    } else {
                        anthropicMessages.push({
                            role: 'assistant',
                            content: msg.content || ''
                        });
                    }
                } else { // user
                    anthropicMessages.push({
                        role: 'user',
                        content: msg.content || ''
                    });
                }
            }

            // Map Tools
            const anthropicTools: Anthropic.Tool[] | undefined = tools?.map(t => ({
                name: t.function.name,
                description: t.function.description,
                input_schema: t.function.parameters as any // Anthropic expects JSON schema
            }));

            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: 4096,
                system: systemMessage,
                messages: anthropicMessages,
                tools: anthropicTools,
            });

            // Parse response
            let content = '';
            const toolCalls: any[] = [];

            for (const block of response.content) {
                if (block.type === 'text') {
                    content += block.text;
                } else if (block.type === 'tool_use') {
                    toolCalls.push({
                        id: block.id,
                        type: 'function',
                        function: {
                            name: block.name,
                            arguments: JSON.stringify(block.input)
                        }
                    });
                }
            }

            return {
                content: content,
                tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                usage: {
                    input_tokens: response.usage.input_tokens,
                    output_tokens: response.usage.output_tokens
                }
            };

        } catch (error: any) {
            console.error('Anthropic API Error:', error.message);
            throw error;
        }
    }
}
