import { describe, expect, it } from 'vitest'
import type { IndexRow, Morpheme } from '@/features/dictionary/types'
import type { ReviewRecord, StudyCard } from '@/lib/db'
import { buildLearningSummary } from './aiSummary'
import { computeAnalytics } from './compute'

const index: IndexRow[] = [
  ['spectator', 0, 1, '観客', ['noun'], 'w0', ['r:spec']],
  ['inspect', 0, 2, '検査する', ['verb'], 'w0', ['pre:into', 'r:spec']],
  ['give_up', 1, 1, '諦める', ['verb'], 'p0', []],
]
const morphemes: Morpheme[] = [{ id: 'r:spec', type: 'root', label: 'spec', forms: ['spec'], meaning: { ja: '見る' }, origin: '', words: ['spectator', 'inspect', 'respect'] }]

describe('buildLearningSummary（AI に渡す学習のまとめ）', () => {
  const now = new Date('2026-11-10T12:00:00').getTime()
  const D = 86400000
  const card = (entryId: string, extra: Partial<StudyCard> = {}): StudyCard => ({
    entryId, due: now + D, stability: 3, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: now - D, addedAt: now - 20 * D, ...extra,
  })
  const cards = [card('spectator', { stability: 0.5, lapses: 2 }), card('inspect', { stability: 50 }), card('give_up', { state: 0, last_review: null }), card('respect', { suspended: 1 })]
  const reviews: ReviewRecord[] = [
    { entryId: 'spectator', rating: 1, state: 2, reviewedAt: now - D, mode: 'review:ja2en' },
    { entryId: 'inspect', rating: 3, state: 2, reviewedAt: now - D, mode: 'review:en2ja', durationMs: 1234 },
  ]
  const data = computeAnalytics({ views: [], cards, reviews, index, morphemes, retrievability: {}, now })
  const s = buildLearningSummary(data, cards, { desiredRetention: 0.9, dailyNewLimit: 10 }, now)

  it('数と、見込みの低い語を入れる（未学習・保留のカードは見込みに入れない）', () => {
    expect(s.totals).toMatchObject({ cards: 3, newCards: 1, reviewCards: 2, suspended: 1 })
    expect(s.memory.lowestRecallNow.map((x) => x.word)).toEqual(['spectator', 'inspect'])
    expect(s.memory.lowestRecallNow[0].percent).toBeLessThan(s.memory.lowestRecallNow[1].percent)
    expect(s.memory.averageRecallIn7DaysIfNoReviewPercent!).toBeLessThanOrEqual(s.memory.averageRecallNowPercent!)
    expect(s.stumbles.last28days[0]).toMatchObject({ word: 'spectator', again: 1 })
    expect(s.last7days).toMatchObject({ answers: 2, recalledPercent: 50, enoughDataForTrend: false })
    expect(s.reflection.byFormat.map((f) => f.format).sort()).toEqual(['日→英', '英→日'])
    expect(s.reflection.predictedVsActual).toBeNull()
  })
  it('熟語は空白区切りの見出しにし、回答の時間やメモなどは含めない', () => {
    const json = JSON.stringify(s)
    expect(json).not.toContain('give_up')
    expect(json).not.toContain('1234')
    expect(json).not.toContain('entryId')
  })
})
