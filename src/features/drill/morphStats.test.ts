import { describe, expect, it } from 'vitest'
import type { StudyCard } from '@/lib/db'
import { groupStats, tendency } from './morphStats'

const NOW = Date.parse('2026-06-01T00:00:00Z')
const DAY = 86_400_000
const card = (entryId: string, stability: number, lapses = 0): StudyCard => ({
  entryId, due: NOW + DAY, stability, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 5, lapses, state: 2, last_review: NOW - 5 * DAY, addedAt: NOW - 30 * DAY,
})
const logs = (entryId: string, again: number, total: number) =>
  Array.from({ length: total }, (_, i) => ({ entryId, rating: i < again ? 1 : 3, reviewedAt: NOW - (i + 1) * DAY }))

describe('語源の単語の覚え具合', () => {
  const cards = [card('a', 2, 3), card('b', 3, 2), card('c', 2, 1), card('x', 60), card('y', 80), card('z', 50), card('w', 70)]
  const ls = [...logs('a', 3, 5), ...logs('b', 2, 5), ...logs('c', 2, 5), ...logs('x', 0, 5), ...logs('y', 0, 5), ...logs('z', 1, 5), ...logs('w', 0, 5)]
  it('その語源の単語だけを集計し、見込みの低い順に並べる', () => {
    const g = groupStats(cards, ls, NOW, new Set(['a', 'b', 'c', 'q']))
    expect(g.learned).toBe(3)
    expect(g.words[0].key).toBe('a')
    expect(g.againRate).toBeCloseTo(7 / 15)
  })
  it('全体より忘れやすければ苦手、覚えていれば得意、語が少なければ分からない', () => {
    const all = groupStats(cards, ls, NOW)
    expect(tendency(groupStats(cards, ls, NOW, new Set(['a', 'b', 'c'])), all)).toBe('weak')
    expect(tendency(groupStats(cards, ls, NOW, new Set(['x', 'y', 'z'])), all)).toBe('strong')
    expect(tendency(groupStats(cards, ls, NOW, new Set(['x', 'y'])), all)).toBe('unknown')
  })
})
