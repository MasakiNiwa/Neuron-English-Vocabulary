import type { SearchFilter } from '@/features/dictionary/search'
import { categoryById } from './categories'

export interface WordsSearch {
  q?: string
  f?: SearchFilter
  /** 入口の分類（categories.ts の id） */
  c?: string
}

export function validateWordsSearch(s: Record<string, unknown>): WordsSearch {
  const f = s.f as SearchFilter
  return {
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    f: ['all', 'w', 'p', 'm'].includes(f) ? f : undefined,
    c: typeof s.c === 'string' && categoryById(s.c) ? s.c : undefined,
  }
}
