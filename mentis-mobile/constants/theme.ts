export const DARK = {
  bg:      '#0d0d0d',
  panel:   '#141414',
  panel2:  '#1a1a1a',
  border:  '#222222',
  border2: '#2a2a2a',
  accent:  '#7c3aed',
  accentL: '#a78bfa',
  muted:   '#666666',
  muted2:  '#888888',
  text:    '#e8e8e8',
  textDim: '#bbb',
  red:     '#f38ba8',
  green:   '#a6e3a1',
  yellow:  '#f9e2af',
} as const

export const LIGHT = {
  bg:      '#f5f5f5',
  panel:   '#ffffff',
  panel2:  '#eeeeee',
  border:  '#d4d4d4',
  border2: '#c0c0c0',
  accent:  '#7c3aed',
  accentL: '#6d28d9',
  muted:   '#888888',
  muted2:  '#666666',
  text:    '#111111',
  textDim: '#444444',
  red:     '#dc2626',
  green:   '#16a34a',
  yellow:  '#d97706',
} as const

// Legacy export — components import this and it's swapped at runtime via useTheme()
export let C = DARK

export const F = {
  mono:   'Courier New',
  system: undefined,
} as const
