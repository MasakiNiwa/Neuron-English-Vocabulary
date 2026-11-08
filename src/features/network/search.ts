export interface NetworkSearch {
  /** "e:<key>" または "m:<id>" */
  focus?: string
  mode?: 'ego' | 'map' | 'path'
}

export function validateNetworkSearch(s: Record<string, unknown>): NetworkSearch {
  return {
    focus: typeof s.focus === 'string' ? s.focus : undefined,
    mode: s.mode === 'map' || s.mode === 'path' ? s.mode : undefined,
  }
}
