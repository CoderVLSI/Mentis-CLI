export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

// Image attachment — base64-encoded image with media type
export interface ImageAttachment {
    base64:    string;
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    name:      string;
}

// Content blocks for multimodal messages
export type ContentBlock =
    | { type: 'text';  text: string }
    | { type: 'image'; mediaType: string; data: string }

export interface ChatMessage {
    role:          'system' | 'user' | 'assistant' | 'tool';
    content:       string | ContentBlock[] | null;
    tool_calls?:   ToolCall[];
    tool_call_id?: string;
    name?:         string;
    images?:       ImageAttachment[];  // pending images attached to this message
}

export interface ChatResponse {
    content:     string;
    tool_calls?: ToolCall[];
    usage?: {
        input_tokens:  number;
        output_tokens: number;
    };
}

export interface ModelResponse {
    content:     string | null;
    tool_calls?: ToolCall[];
    usage?: {
        input_tokens:  number;
        output_tokens: number;
    };
}

export interface ToolDefinition {
    type: 'function';
    function: {
        name:        string;
        description: string;
        parameters:  object;
    };
}

export interface ModelClient {
    chat(messages: ChatMessage[], tools?: ToolDefinition[], signal?: AbortSignal): Promise<ModelResponse>;
}

// Helper: build a user message content array with optional images
export function buildUserContent(
    text: string,
    images?: ImageAttachment[],
): string | ContentBlock[] {
    if (!images || images.length === 0) return text
    const blocks: ContentBlock[] = images.map(img => ({
        type:      'image' as const,
        mediaType: img.mediaType,
        data:      img.base64,
    }))
    if (text) blocks.push({ type: 'text', text })
    return blocks
}
