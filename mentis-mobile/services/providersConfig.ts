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
      { id: 'gpt-5.5',      label: 'GPT-5.5',       hint: 'Latest flagship' },
      { id: 'gpt-5.4',      label: 'GPT-5.4',        hint: 'Previous flagship' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini',   hint: 'Fast & cheap' },
      { id: 'gpt-4.1',      label: 'GPT-4.1',        hint: 'Stable' },
      { id: 'gpt-4o',       label: 'GPT-4o',         hint: 'Multimodal' },
      { id: 'o3',           label: 'o3',             hint: 'Top reasoning' },
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
      { id: 'gemini-2.5-flash',        label: 'Gemini 2.5 Flash',       hint: 'Fast & efficient' },
      { id: 'gemini-2.5-pro',          label: 'Gemini 2.5 Pro',         hint: 'Most capable' },
      { id: 'gemini-3.1-pro-preview',  label: 'Gemini 3.1 Pro Preview', hint: 'Preview' },
      { id: 'gemini-3-pro-preview',    label: 'Gemini 3 Pro Preview',   hint: 'Preview' },
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
      { id: 'grok-4.20',   label: 'Grok 4.20',   hint: 'Latest' },
      { id: 'grok-3',      label: 'Grok 3',      hint: 'Most capable' },
      { id: 'grok-3-mini', label: 'Grok 3 Mini', hint: 'Fast & efficient' },
      { id: 'grok-2-1212', label: 'Grok 2',      hint: 'Previous gen' },
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
      { id: 'kimi-k2.6',        label: 'Kimi K2.6',   hint: 'Latest' },
      { id: 'kimi-k2.5',        label: 'Kimi K2.5',   hint: 'Previous' },
      { id: 'kimi-k2',          label: 'Kimi K2',     hint: 'Stable' },
      { id: 'moonshot-v1-128k', label: 'Kimi 128K',   hint: '128K context' },
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
      { id: 'glm-5.1',   label: 'GLM-5.1',   hint: 'Latest' },
      { id: 'glm-5',     label: 'GLM-5',     hint: 'Flagship' },
      { id: 'glm-4.7',   label: 'GLM-4.7',   hint: 'Balanced' },
      { id: 'glm-4.6',   label: 'GLM-4.6',   hint: 'Stable' },
      { id: 'glm-4.5',   label: 'GLM-4.5',   hint: 'Previous gen' },
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
