import { describe, expect, it } from 'vitest'
import type { IndexRow, Morpheme } from '@/features/dictionary/types'
import { computeAnalytics } from './compute'

const index: IndexRow[] = [
  ['spectator', 0, 1, '観客', ['noun'], 'w0', ['r:spec']],
  ['inspect', 0, 2, '検査する', ['verb'], 'w0', ['pre:into', 'r:spec']],
  ['respect', 0, 3, '尊敬', ['noun'], 'w0', ['pre:re', 'r:spec']],
  ['give_up', 1, 1, '諦める', ['verb'], 'p0', []],
]
const morphemes: Morpheme[] = [
  { id: 'r:spec', type: 'root', label: 'spec', forms: ['spec'], meaning: { ja: '見る' }, origin: '', words: ['spectator', 'inspect', 'respect'] },
]

describe('computeAnalytics', () => {
  it('aggregates views, coverage and insights', () => {
    const now = new Date('2026-11-01T12:00:00').getTime()
    const res = computeAnalytics({
      views: [
        { entryId: 'spectator', viewedAt: now - 1000 },
        { entryId: 'inspect', viewedAt: now - 86400000 },
      ],
      cards: [],
      reviews: [],
      index,
      morphemes,
      retrievability: {},
      now,
    })
    expect(res.totals.uniqueViewed).toBe(2)
    expect(res.totals.streak).toBe(2)
    expect(res.roots[0].seen).toBe(2)
    expect(res.roots[0].unseenKeys).toEqual(['respect'])
    expect(res.insights.some((i) => i.kind === 'root' && i.keys?.includes('respect'))).toBe(true)
  })
})
