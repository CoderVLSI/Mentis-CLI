import {
    getDefaultEffort,
    getEffectiveEffort,
    getMaxOutputTokens,
    getModelPresets,
    getSupportedEfforts,
    isProvider,
} from '../ModelCatalog';

describe('ModelCatalog', () => {
    it('contains current flagship models', () => {
        expect(getModelPresets('anthropic').map(m => m.id)).toEqual(expect.arrayContaining([
            'claude-opus-5',
            'claude-sonnet-5',
        ]));
        expect(getModelPresets('openai').map(m => m.id)).toContain('gpt-5.6-sol');
        expect(getModelPresets('gemini').map(m => m.id)).toContain('gemini-3.6-flash');
    });

    it('exposes provider/model-specific effort levels', () => {
        expect(getSupportedEfforts('anthropic', 'claude-opus-5')).toContain('max');
        expect(getSupportedEfforts('gemini', 'gemini-3.1-pro-preview')).toEqual(['low', 'medium', 'high']);
        expect(getSupportedEfforts('gemini', 'gemini-3.5-flash-lite')).toContain('minimal');
        expect(getSupportedEfforts('openai', 'gpt-4.1')).toEqual([]);
    });

    it('does not guess effort support for custom model IDs', () => {
        expect(getEffectiveEffort('openai', 'my-private-model', 'high')).toBeUndefined();
        expect(getEffectiveEffort('anthropic', 'claude-opus-5', 'max')).toBe('max');
    });

    it('provides defaults without forcing them onto custom models', () => {
        expect(getDefaultEffort('openai', 'gpt-5.6-terra')).toBe('medium');
        expect(getDefaultEffort('gemini', 'gemini-3.5-flash-lite')).toBe('minimal');
        expect(getDefaultEffort('openai', 'custom')).toBeUndefined();
        expect(isProvider('anthropic')).toBe(true);
        expect(isProvider('unknown')).toBe(false);
    });

    it('gives high effort enough output room for reasoning', () => {
        expect(getMaxOutputTokens('medium')).toBe(8096);
        expect(getMaxOutputTokens('high')).toBe(16384);
        expect(getMaxOutputTokens('max')).toBe(32768);
    });
});
