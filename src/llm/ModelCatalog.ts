export const PROVIDERS = ['anthropic', 'gemini', 'openai', 'ollama', 'glm'] as const;

export type Provider = typeof PROVIDERS[number];
export type EffortLevel = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelPreset {
    id: string;
    label: string;
    efforts?: readonly EffortLevel[];
    defaultEffort?: EffortLevel;
}

const FULL_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const FULL_EFFORT_WITH_NONE = ['none', ...FULL_EFFORT] as const;
const COMMON_EFFORT = ['low', 'medium', 'high'] as const;
const GEMINI_FLASH_EFFORT = ['minimal', ...COMMON_EFFORT] as const;

export const MODEL_CATALOG: Record<Provider, readonly ModelPreset[]> = {
    anthropic: [
        { id: 'claude-fable-5', label: 'Claude Fable 5 — longest autonomous work', efforts: FULL_EFFORT, defaultEffort: 'high' },
        { id: 'claude-opus-5', label: 'Claude Opus 5 — deepest coding and reasoning', efforts: FULL_EFFORT, defaultEffort: 'high' },
        { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — recommended balance', efforts: FULL_EFFORT, defaultEffort: 'high' },
        { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fast and economical' },
        { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', efforts: FULL_EFFORT, defaultEffort: 'high' },
        { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', efforts: FULL_EFFORT, defaultEffort: 'high' },
    ],
    openai: [
        { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol — flagship coding', efforts: FULL_EFFORT_WITH_NONE, defaultEffort: 'high' },
        { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra — balanced', efforts: FULL_EFFORT_WITH_NONE, defaultEffort: 'medium' },
        { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna — fastest/lowest cost', efforts: FULL_EFFORT_WITH_NONE, defaultEffort: 'low' },
        { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex — agentic coding', efforts: COMMON_EFFORT, defaultEffort: 'high' },
        { id: 'gpt-4.1', label: 'GPT-4.1 — non-reasoning' },
    ],
    gemini: [
        { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash — latest balanced', efforts: GEMINI_FLASH_EFFORT, defaultEffort: 'medium' },
        { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash — coding and agents', efforts: GEMINI_FLASH_EFFORT, defaultEffort: 'medium' },
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite — economical', efforts: GEMINI_FLASH_EFFORT, defaultEffort: 'minimal' },
        { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro — preview', efforts: COMMON_EFFORT, defaultEffort: 'high' },
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', efforts: COMMON_EFFORT, defaultEffort: 'high' },
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', efforts: COMMON_EFFORT, defaultEffort: 'medium' },
    ],
    ollama: [
        { id: 'llama3:latest', label: 'Llama 3 (local)' },
        { id: 'deepseek-r1:latest', label: 'DeepSeek R1 (local)' },
        { id: 'qwen2.5-coder', label: 'Qwen 2.5 Coder (local)' },
        { id: 'mistral:latest', label: 'Mistral (local)' },
    ],
    glm: [
        { id: 'glm-4.6', label: 'GLM 4.6' },
        { id: 'glm-4-plus', label: 'GLM 4 Plus' },
        { id: 'glm-4-air', label: 'GLM 4 Air' },
        { id: 'glm-4-flash', label: 'GLM 4 Flash' },
    ],
};

export function isProvider(value: string): value is Provider {
    return (PROVIDERS as readonly string[]).includes(value);
}

export function getModelPresets(provider: Provider): readonly ModelPreset[] {
    return MODEL_CATALOG[provider];
}

/**
 * Return effort levels that are safe to send for a model. Unknown model IDs
 * remain usable, but no guessed provider parameter is sent to their API.
 */
export function getSupportedEfforts(provider: Provider, model: string): readonly EffortLevel[] {
    return MODEL_CATALOG[provider].find(preset => preset.id === model)?.efforts ?? [];
}

export function getDefaultEffort(provider: Provider, model: string): EffortLevel | undefined {
    return MODEL_CATALOG[provider].find(preset => preset.id === model)?.defaultEffort;
}

export function getEffectiveEffort(
    provider: Provider,
    model: string,
    configured?: string,
): EffortLevel | undefined {
    if (!configured) return undefined;
    const supported = getSupportedEfforts(provider, model);
    return supported.includes(configured as EffortLevel) ? configured as EffortLevel : undefined;
}

export function getMaxOutputTokens(effort?: EffortLevel): number {
    if (effort === 'xhigh' || effort === 'max') return 32768;
    if (effort === 'high') return 16384;
    return 8096;
}
