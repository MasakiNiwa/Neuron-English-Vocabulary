import { describe, expect, it } from 'vitest'
import type { IndexRow, Morpheme } from '@/features/dictionary/types'
import type { ReviewRecord, StudyCard } from '@/lib/db'
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

describe('学びにつながる集計', () => {
  const now = new Date('2026-11-10T12:00:00').getTime()
  const D = 86400000
  const card = (entryId: string, extra: Partial<StudyCard> = {}): StudyCard => ({
    entryId, due: now + D, stability: 3, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: now - D, addedAt: now - 20 * D, ...extra,
  })
  const rv = (entryId: string, rating: number, t: number): ReviewRecord => ({ entryId, rating, state: 2, reviewedAt: t })
  const run = (cards: StudyCard[], reviews: ReviewRecord[]) => computeAnalytics({ views: [], cards, reviews, index, morphemes, retrievability: {}, now })

  it('最近つまずいた語は、そのあと別の日に思い出せた語を除く（昔の失敗に縛られない）', () => {
    const res = run(
      [card('spectator'), card('inspect'), card('respect', { suspended: 1 })],
      [
        rv('spectator', 1, now - 2 * D), rv('spectator', 3, now - 2 * D + 600000), // 同じ日の再練習だけ → まだつまずき
        rv('inspect', 1, now - 3 * D), rv('inspect', 3, now - D), // 別の日に思い出せた → 立ち直った
        rv('respect', 1, now - D), // 保留中のカードは出さない
      ],
    )
    expect(res.stumbles[7].map((s) => s.key)).toEqual(['spectator'])
    expect(res.recovered).toEqual(['inspect'])
    expect(res.recent[7].spacedRecall).toEqual(['inspect'])
  })

  it('回答の割合は「難しい」以上と「正解・簡単」を分け、少ない記録では傾向を出さない', () => {
    const res = run([card('spectator')], [rv('spectator', 2, now - D), rv('spectator', 3, now - 2 * D), rv('spectator', 1, now - 3 * D), rv('spectator', 4, now - 40 * D)])
    expect(res.recent[7].answers).toBe(3)
    expect(res.recent[7].recalled).toBeCloseTo(2 / 3)
    expect(res.recent[7].goodEasy).toBeCloseTo(1 / 3)
    expect(res.recent[7].enough).toBe(false)
    expect(res.recent[28].answers).toBe(3)
  })

  it('今後 7 日の予定: 期限を過ぎたカードは今日に、新しいカード・保留中は数えない', () => {
    const res = run(
      [card('spectator', { due: now - 5 * D }), card('inspect', { due: now + 2 * D }), card('respect', { state: 0, due: now }), card('give_up', { due: now, suspended: 1 })],
      [],
    )
    expect(res.forecast[0].keys).toEqual(['spectator'])
    expect(res.forecast[2].keys).toEqual(['inspect'])
    expect(res.forecast.reduce((n, d) => n + d.keys.length, 0)).toBe(2)
  })

  it('語根の段階は重ならず、学んだ語根から次の語を勧める', () => {
    const res = run(
      [card('spectator'), card('inspect')],
      [rv('spectator', 3, now - 5 * D), rv('spectator', 3, now - D), rv('inspect', 3, now - 6 * D), rv('inspect', 2, now - 2 * D)],
    )
    const r = res.roots[0]
    expect(r.recalledKeys.sort()).toEqual(['inspect', 'spectator'])
    expect(r.studiedKeys).toHaveLength(2)
    expect(r.viewedOnlyKeys).toEqual([])
    expect(res.rootNext[0]).toMatchObject({ id: 'r:spec', recalled: 2, candidates: ['respect'] })
  })
})
