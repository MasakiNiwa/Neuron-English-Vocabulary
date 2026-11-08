import { describe, expect, it } from 'vitest'
import type { ReviewRecord, StudyCard } from '@/lib/db'
import { convertCard } from './migrate'
import { modelOf, newCard, previewDue, recallProbability, replay7, reviewCard, strengthDays } from './srs'

const T0 = Date.parse('2026-01-01T00:00:00Z')
const MIN = 60_000
const DAY = 86_400_000

/** v1.4 まで（ts-fsrs 5）で作ったのと同じ形の、まだ回答していないカード */
function legacyCard(entryId = 'run', addedAt = T0): StudyCard {
  return { entryId, due: addedAt, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null, addedAt }
}

/** 回答の並び（評価, 前の回答からの分） */
const SEQ: [1 | 2 | 3 | 4, number][] = [
  [3, 0],
  [3, 10],
  [3, 60 * 24],
  [1, 60 * 24 * 3],
  [3, 10],
  [3, 60 * 24],
  [4, 60 * 24 * 5],
  [2, 60 * 24 * 20],
]

/** カードに SEQ の順で回答し、回答の記録も作る（v1.4 までの review と同じ形） */
function play(card: StudyCard, seq = SEQ) {
  let c = card
  let t = card.addedAt
  const logs: ReviewRecord[] = []
  seq.forEach(([g, mins], i) => {
    t += mins * MIN
    const next = reviewCard(c, g, new Date(t), 0.9)
    logs.push({ id: i + 1, entryId: c.entryId, rating: g, state: c.state, reviewedAt: t, stability: next.stability, difficulty: next.difficulty })
    c = next
  })
  return { card: c, logs, t }
}

describe('FSRS-6（v1.4 までのカード）', () => {
  it('ts-fsrs 5 と同じ記憶の状態になる（v1.4 で計算した値）', () => {
    const { card } = play(legacyCard())
    expect(modelOf(card)).toBe(6)
    expect(card.stability).toBeCloseTo(33.57140655, 6)
    expect(card.difficulty).toBeCloseTo(7.64226213, 6)
    expect(card.reps).toBe(8)
    expect(card.lapses).toBe(1)
    expect(strengthDays(card)).toBe(card.stability)
  })
  it('想起確率も ts-fsrs 5 と同じ', () => {
    const { card, t } = play(legacyCard())
    expect(recallProbability(card, new Date(t + 10 * DAY))).toBeCloseTo(0.96126332, 6)
  })
  it('学習ステップ（1 分・10 分）はこれまでどおり', () => {
    const p = previewDue(legacyCard(), new Date(T0), 0.9)
    expect(p[1].getTime() - T0).toBe(MIN)
    expect(p[3].getTime() - T0).toBe(10 * MIN)
  })
})

describe('FSRS-7（新しいカード）', () => {
  it('新しいカードは FSRS-7 で、速い記憶の成分を持つ', () => {
    const c = newCard('give', T0)
    expect(c.model).toBe(7)
    const { card } = play(c)
    expect(card.model).toBe(7)
    expect(card.stabilityFast).toBeGreaterThan(0)
    expect(card.reps).toBe(8)
    const r = recallProbability(card, new Date(card.last_review! + 3 * DAY))
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(1)
  })
  it('学習ステップ（1 分・10 分）は FSRS-7 でもこれまでどおり', () => {
    const p = previewDue(newCard('give', T0), new Date(T0), 0.9)
    expect(p[1].getTime() - T0).toBe(MIN)
    expect(p[3].getTime() - T0).toBe(10 * MIN)
  })
})

describe('FSRS-7 への移行', () => {
  it('回答が揃っているカードは、記憶の状態だけを FSRS-7 にし、予定・回数はそのまま', () => {
    const { card, logs } = play(legacyCard())
    const out = convertCard(card, logs, T0 + 100 * DAY)!
    expect(out).not.toBeNull()
    expect(out.model).toBe(7)
    expect(out.due).toBe(card.due)
    expect(out.last_review).toBe(card.last_review)
    expect([out.reps, out.lapses, out.state, out.learning_steps, out.scheduled_days]).toEqual([card.reps, card.lapses, card.state, card.learning_steps, card.scheduled_days])
    const s7 = replay7(logs.map((l) => ({ rating: l.rating, reviewedAt: l.reviewedAt })))!
    expect(out.stability).toBe(s7.stability)
    expect(out.stabilityFast).toBe(s7.stabilityFast)
    // 新しいモデルの記録として「今日の分」の回答などを作らない
    expect(logs).toHaveLength(8)
  })
  it('まだ回答していないカードはそのまま移す', () => {
    const out = convertCard(legacyCard(), [], T0)!
    expect(out.model).toBe(7)
    expect(out.stabilityFast).toBe(0)
  })
  it('回答が欠けているカードは移さない（FSRS-6 のまま）', () => {
    const { card, logs } = play(legacyCard())
    expect(convertCard(card, logs.slice(1), T0)).toBeNull()
    expect(convertCard(card, logs.filter((_, i) => i !== 3), T0)).toBeNull()
  })
  it('回数は合っていても、中身が違う記録（評価の取り違え）なら移さない', () => {
    const { card, logs } = play(legacyCard())
    const wrong = logs.map((l, i) => (i === 2 ? { ...l, rating: 4 } : l))
    expect(convertCard(card, wrong, T0)).toBeNull()
  })
  it('削除して追加し直した語は、前の回の記録を混ぜない', () => {
    const first = play(legacyCard('run', T0))
    const again = play(legacyCard('run', first.t + 30 * DAY), SEQ.slice(0, 4))
    const logs = [...first.logs, ...again.logs.map((l) => ({ ...l, id: (l.id ?? 0) + 100 }))]
    const out = convertCard(again.card, logs, T0)!
    expect(out).not.toBeNull()
    const s7 = replay7(again.logs.map((l) => ({ rating: l.rating, reviewedAt: l.reviewedAt })))!
    expect(out.stability).toBe(s7.stability)
  })
  it('FSRS-7 のカードはもう一度は移さない', () => {
    expect(convertCard(newCard('x', T0), [], T0)).toBeNull()
  })
})
