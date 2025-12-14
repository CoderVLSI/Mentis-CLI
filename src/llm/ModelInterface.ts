export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'; // Added 'tool' role
    content: string | null; // Content can be null for tool calls
    tool_calls?: ToolCall[];
    tool_call_id?: string; // For tool role messages
    name?: string; // For tool role messages
}

export interface ModelResponse {
    content: string | null;
    tool_calls?: ToolCall[];
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: object;
    };
}

export interface ModelClient {
    chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ModelResponse>;
}
