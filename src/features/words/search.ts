import type { SearchFilter } from '@/features/dictionary/search'

export interface WordsSearch {
  q?: string
  f?: SearchFilter
}

export function validateWordsSearch(s: Record<string, unknown>): WordsSearch {
  const f = s.f as SearchFilter
  return {
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    f: ['all', 'w', 'p', 'm'].includes(f) ? f : undefined,
  }
}

