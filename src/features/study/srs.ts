import { dateChrono, defineScheduler, type Grade } from 'ts-fsrs'
import {
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerStatsMiddleware,
} from 'ts-fsrs/middlewares'
import { FSRS6_DEFAULT_WEIGHTS, FSRS6Model } from 'ts-fsrs/models/fsrs-6'
import { curve as fsrs7Curve, FSRS7_DEFAULT_WEIGHTS, FSRS7Model } from 'ts-fsrs/models/fsrs-7'
import { Reschedule } from 'ts-fsrs/reschedule'
import type { StudyCard } from '@/lib/db'

/**
 * 復習日の計算（FSRS）の共通部品。学習画面・分析の Worker・移行処理のすべてがここを通す。
 * 画面や設定ストアには依存しない（Worker からも使えるように）。
 *
 * - FSRS-7: 新しく作るカードと、履歴を確かめて移したカード（card.model === 7）
 * - FSRS-6: それ以外（v1.4 までに作ったカードで、履歴が確かめられないもの）。
 *   v1.4 まで（ts-fsrs 5）と同じ設定にして、同じ結果になるようにしてある（srs.test.ts で確認）
 *
 * カードの保存形式（StudyCard）は v1.4 までと同じ名前の項目を使い、FSRS-7 のときだけ stabilityFast などを足す
 */

export type ModelVersion = 6 | 7

/** v1.4 まで（ts-fsrs 5 の fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: true }))）と同じ方針 */
const POLICY = {
  enableShortTerm: true,
  learningSteps: ['1m', '10m'] as const,
  relearningSteps: ['10m'] as const,
  numRelearningSteps: 1,
  maximumInterval: 36500,
  enableFuzz: true,
  // ts-fsrs 5 の forget の既定（回数を消さない）に合わせる
  clearStatsOnForget: false,
  // FSRS-7 でも、学習ステップ（1 分・10 分）はこれまでどおりにする
  allowModelOverride: false,
}

const MIDDLEWARES = [
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerStatsMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
] as const

const def6 = defineScheduler({ model: FSRS6Model, chrono: dateChrono }).use(...MIDDLEWARES)
const def7 = defineScheduler({ model: FSRS7Model, chrono: dateChrono }).use(...MIDDLEWARES)

function create6(desiredRetention: number, enableFuzz = POLICY.enableFuzz) {
  return def6.create({
    config: {
      ...POLICY,
      learningSteps: [...POLICY.learningSteps],
      relearningSteps: [...POLICY.relearningSteps],
      enableFuzz,
      desiredRetention,
      fractionalDays: false,
      weights: [...FSRS6_DEFAULT_WEIGHTS],
    },
  })
}
function create7(desiredRetention: number, enableFuzz = POLICY.enableFuzz) {
  return def7.create({
    config: {
      ...POLICY,
      learningSteps: [...POLICY.learningSteps],
      relearningSteps: [...POLICY.relearningSteps],
      enableFuzz,
      desiredRetention,
      fractionalDays: true,
      weights: [...FSRS7_DEFAULT_WEIGHTS],
    },
  })
}

export type Scheduler6 = ReturnType<typeof create6>
export type Scheduler7 = ReturnType<typeof create7>
type Card6 = Parameters<Scheduler6['review']>[0]['card']
type Card7 = Parameters<Scheduler7['review']>[0]['card']

const cache = new Map<string, Scheduler6 | Scheduler7>()
function get6(r: number, fuzz = true): Scheduler6 {
  const k = `6|${r}|${fuzz}`
  let s = cache.get(k) as Scheduler6 | undefined
  if (!s) cache.set(k, (s = create6(r, fuzz)))
  return s
}
function get7(r: number, fuzz = true): Scheduler7 {
  const k = `7|${r}|${fuzz}`
  let s = cache.get(k) as Scheduler7 | undefined
  if (!s) cache.set(k, (s = create7(r, fuzz)))
  return s
}

export function modelOf(c: Pick<StudyCard, 'model'>): ModelVersion {
  return c.model === 7 ? 7 : 6
}

const STATUS = ['new', 'learning', 'review', 'learning'] as const

function toCard6(c: StudyCard): Card6 {
  return {
    cardId: c.entryId,
    stability: c.stability,
    difficulty: c.difficulty,
    state: c.state as Card6['state'],
    scheduleStatus: STATUS[c.state] ?? 'new',
    dueAt: new Date(c.due),
    lastReviewAt: c.state === 0 || c.last_review == null ? null : new Date(c.last_review),
    reps: c.reps,
    lapses: c.lapses,
    scheduledDays: c.scheduled_days,
    learningStep: c.learning_steps,
  } as Card6
}

function toCard7(c: StudyCard): Card7 {
  return { ...toCard6(c), stabilityFast: c.stabilityFast ?? 0 } as Card7
}

type AnyCard = Card6 | (Card7 & { stabilityFast?: number })

/** ts-fsrs のカード → 保存する形（予定・回数などに加え、FSRS-7 なら stabilityFast も） */
function fromCard(base: StudyCard, card: AnyCard, model: ModelVersion): StudyCard {
  const out: StudyCard = {
    ...base,
    due: card.dueAt.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    // v1.4 までの項目。今は計算に使わないが、古い版のバックアップの形に合わせて残す
    elapsed_days: 0,
    scheduled_days: card.scheduledDays ?? 0,
    learning_steps: card.learningStep ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.lastReviewAt ? card.lastReviewAt.getTime() : null,
  }
  if (model === 7) {
    out.model = 7
    out.stabilityFast = (card as Card7).stabilityFast ?? 0
  } else {
    delete out.model
    delete out.stabilityFast
  }
  return out
}

/** 新しいカード（FSRS-7） */
export function newCard(entryId: string, now: number, addedAt = now): StudyCard {
  const c = get7(0.9).newCard({ now: new Date(now), cardId: entryId })
  return fromCard({ entryId, addedAt, run: crypto.randomUUID() } as StudyCard, c, 7)
}

/** 回答して次の状態にする（入力のカードは変えない） */
export function reviewCard(c: StudyCard, grade: Grade, now: Date, desiredRetention: number): StudyCard {
  if (modelOf(c) === 7) return fromCard(c, get7(desiredRetention).review({ card: toCard7(c), grade, now }).card, 7)
  return fromCard(c, get6(desiredRetention).review({ card: toCard6(c), grade, now }).card, 6)
}

/** 各評価を選んだときの次の期限 */
export function previewDue(c: StudyCard, now: Date, desiredRetention: number): Record<Grade, Date> {
  const out = {} as Record<Grade, Date>
  const items = modelOf(c) === 7 ? get7(desiredRetention).preview({ card: toCard7(c), now }) : get6(desiredRetention).preview({ card: toCard6(c), now })
  for (const p of items) out[p.grade as Grade] = p.card.dueAt
  return out
}

/** 今の想起確率（0〜1）。まだ回答していないカードは 0 */
export function recallProbability(c: StudyCard, now: Date = new Date()): number {
  if (c.state === 0 || c.last_review == null) return 0
  if (modelOf(c) === 7) {
    const s = get7(0.9)
    return s.model.forgettingCurve(toCard7(c), Math.max(0, s.chrono.difference(new Date(c.last_review), now)))
  }
  const s = get6(0.9)
  return s.model.forgettingCurve(toCard6(c), Math.max(0, s.chrono.difference(new Date(c.last_review), now)))
}

/**
 * 覚えの強さ（日）: 思い出せる見込みが 90% まで下がるまでの日数。モデルによらず同じ意味で比べられる。
 * FSRS-6 では安定度（stability）そのもの（v1.4 までの「安定度 7 日未満」の判定と同じ結果になる）
 */
export function strengthDays(c: StudyCard): number {
  if (c.state === 0) return 0
  if (modelOf(c) === 7) return get7(0.9, false).model.nextInterval(toCard7(c), 0.9)
  return c.stability
}

// ---------------------------------------------------------------- 忘却曲線

export interface CurvePoint {
  /** 今からの日数 */
  days: number
  /** 思い出せる見込み（0〜1） */
  r: number
  /** FSRS-7 のみ: すぐ薄れる成分・長く残る成分（それぞれの見込み。足し合わせたものではない） */
  fast?: number
  slow?: number
}

export interface RecallCurve {
  points: CurvePoint[]
  /** FSRS-7 のみ: 見込みを作るときの、長く残る成分の重み（0〜1） */
  slowShare?: number
}

/**
 * 今から horizonDays 日後までの、思い出せる見込みの曲線（復習しなかった場合）。
 * 推定であって、学習の効果を測ったものではない
 */
export function recallCurve(c: StudyCard, now: Date, horizonDays: number, steps = 60): RecallCurve | null {
  if (c.state === 0 || c.last_review == null) return null
  const base = Math.max(0, (now.getTime() - c.last_review) / 86_400_000)
  const xs = Array.from({ length: steps + 1 }, (_, i) => (horizonDays * i) / steps)
  if (modelOf(c) === 7) {
    const state = { stability: c.stability, stabilityFast: c.stabilityFast ?? 0, difficulty: c.difficulty }
    let slowShare: number | undefined
    const points = xs.map((days) => {
      const k = fsrs7Curve(FSRS7_DEFAULT_WEIGHTS, base + days, state)
      slowShare ??= k.slowWeight / k.total
      return { days, r: k.retrievability, fast: k.fast, slow: k.slow }
    })
    return { points, slowShare }
  }
  const s = get6(0.9)
  return { points: xs.map((days) => ({ days, r: s.model.forgettingCurve(toCard6(c), base + days) })) }
}

// ---------------------------------------------------------------- 移行（FSRS-6 → FSRS-7）

export interface HistoryItem {
  rating: number
  reviewedAt: number
}

/** 履歴を FSRS-6 でたどり直した記憶の状態（保存されている状態と一致すれば、履歴が欠けていないと確かめられる） */
export function replay6(history: HistoryItem[]): { stability: number; difficulty: number } | null {
  const reviews = history.map((h) => ({ rating: h.rating as Grade, reviewTime: new Date(h.reviewedAt) }))
  const r = new Reschedule(get6(0.9, false)).replay({ history: reviews }, { sortHistory: false })
  const m = r.memoryState as { stability: number; difficulty: number } | undefined
  return m ? { stability: m.stability, difficulty: m.difficulty } : null
}

/** 履歴を FSRS-7 でたどり直した記憶の状態 */
export function replay7(history: HistoryItem[]): { stability: number; stabilityFast: number; difficulty: number } | null {
  const reviews = history.map((h) => ({ rating: h.rating as Grade, reviewTime: new Date(h.reviewedAt) }))
  const r = new Reschedule(get7(0.9, false)).replay({ history: reviews }, { sortHistory: false })
  const m = r.memoryState as { stability: number; stabilityFast: number; difficulty: number } | undefined
  return m ? { stability: m.stability, stabilityFast: m.stabilityFast, difficulty: m.difficulty } : null
}
