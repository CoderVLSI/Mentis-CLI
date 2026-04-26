export interface ProviderModel {
  id:    string
  label: string
  hint?: string
  free?: boolean
}

export interface ProviderDef {
  id:          string
  label:       string
  icon:        string
  color:       string
  settingsKey: string   // which Settings field holds the API key
  format:      'anthropic' | 'openai'
  baseUrl:     string
  models:      ProviderModel[]
  fetchModels?: boolean  // true = auto-fetch from API (OpenRouter)
}

export const PROVIDERS: ProviderDef[] = [
  {
    id:          'anthropic',
    label:       'Anthropic',
    icon:        '◎',
    color:       '#CC785C',
    settingsKey: 'anthropicKey',
    format:      'anthropic',
    baseUrl:     'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-opus-4-7',           label: 'Claude Opus 4.7',   hint: 'Most capable' },
      { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', hint: 'Balanced' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  hint: 'Fast & cheap' },
    ],
  },
  {
    id:          'openai',
    label:       'OpenAI',
    icon:        '◈',
    color:       '#10A37F',
    settingsKey: 'openaiKey',
    format:      'openai',
    baseUrl:     'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o',        label: 'GPT-4o',       hint: 'Most capable' },
      { id: 'gpt-4o-mini',   label: 'GPT-4o Mini',  hint: 'Fast & cheap' },
      { id: 'o3',            label: 'o3',            hint: 'Top reasoning' },
      { id: 'o3-mini',       label: 'o3 Mini',       hint: 'Fast reasoning' },
      { id: 'o1',            label: 'o1',            hint: 'Advanced reasoning' },
      { id: 'o1-mini',       label: 'o1 Mini',       hint: 'Faster reasoning' },
    ],
  },
  {
    id:          'gemini',
    label:       'Gemini',
    icon:        '✦',
    color:       '#4285F4',
    settingsKey: 'geminiKey',
    format:      'openai',
    baseUrl:     'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      { id: 'gemini-2.5-pro-preview-06-05',   label: 'Gemini 2.5 Pro',      hint: 'Most capable' },
      { id: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash',    hint: 'Fast & efficient' },
      { id: 'gemini-2.0-flash-exp',           label: 'Gemini 2.0 Flash Exp', hint: 'Experimental' },
      { id: 'gemini-1.5-pro',                 label: 'Gemini 1.5 Pro',       hint: 'Stable' },
      { id: 'gemini-1.5-flash',               label: 'Gemini 1.5 Flash',     hint: 'Lightweight' },
    ],
  },
  {
    id:          'grok',
    label:       'Grok',
    icon:        '✕',
    color:       '#FFFFFF',
    settingsKey: 'grokKey',
    format:      'openai',
    baseUrl:     'https://api.x.ai/v1',
    models: [
      { id: 'grok-3',        label: 'Grok 3',        hint: 'Most capable' },
      { id: 'grok-3-mini',   label: 'Grok 3 Mini',   hint: 'Fast & efficient' },
      { id: 'grok-2-1212',   label: 'Grok 2',        hint: 'Previous gen' },
    ],
  },
  {
    id:          'kimi',
    label:       'Kimi',
    icon:        '⌘',
    color:       '#1B6FFF',
    settingsKey: 'kimiKey',
    format:      'openai',
    baseUrl:     'https://api.moonshot.cn/v1',
    models: [
      { id: 'moonshot-v1-8k',   label: 'Kimi 8K',   hint: '8K context' },
      { id: 'moonshot-v1-32k',  label: 'Kimi 32K',  hint: '32K context' },
      { id: 'moonshot-v1-128k', label: 'Kimi 128K', hint: '128K context' },
    ],
  },
  {
    id:          'glm',
    label:       'GLM',
    icon:        '⬡',
    color:       '#3B82F6',
    settingsKey: 'glmKey',
    format:      'openai',
    baseUrl:     'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4-flash',  label: 'GLM-4 Flash',   hint: 'Free · Fast', free: true },
      { id: 'glm-z1-flash', label: 'GLM-Z1 Flash',  hint: 'Free · Reasoning', free: true },
      { id: 'glm-4',        label: 'GLM-4',          hint: 'Most capable' },
      { id: 'glm-4-air',    label: 'GLM-4 Air',      hint: 'Balanced' },
      { id: 'glm-4-airx',   label: 'GLM-4 AirX',     hint: 'Ultra fast' },
    ],
  },
  {
    id:          'openrouter',
    label:       'OpenRouter',
    icon:        '⇄',
    color:       '#8B5CF6',
    settingsKey: 'openrouterKey',
    format:      'openai',
    baseUrl:     'https://openrouter.ai/api/v1',
    models:      [],   // populated by auto-fetch
    fetchModels: true,
  },
  {
    id:          'ollama',
    label:       'Ollama',
    icon:        '⬇',
    color:       '#94A3B8',
    settingsKey: '',
    format:      'openai',
    baseUrl:     '',   // taken from settings.ollamaUrl
    models:      [],   // user types model name
  },
]

export const getProvider = (id: string): ProviderDef | undefined =>
  PROVIDERS.find(p => p.id === id)

export const DEFAULT_MODEL: Record<string, string> = {
  anthropic:  'claude-sonnet-4-6',
  openai:     'gpt-4o',
  gemini:     'gemini-2.5-flash-preview-05-20',
  grok:       'grok-3-mini',
  kimi:       'moonshot-v1-32k',
  glm:        'glm-4-flash',
  openrouter: 'google/gemini-2.0-flash-exp:free',
  ollama:     'llama3',
}
