import { db, type StudyCard } from '@/lib/db'
import { useSettings } from '@/stores/settings'
import { loadDictionary } from '@/features/dictionary/data'
import { addManyToStudy } from './cards'
import { recallProbability } from './srs'

/** 並びをランダムにする（毎回同じ順で出題しないように）。元の配列は変えない */
export function shuffle<T>(xs: T[], random: () => number = Math.random): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 今日 0 時のタイムスタンプ */
export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 今日すでに学習を始めた新規カード数 */
export async function newIntroducedToday() {
  const since = startOfToday()
  const logs = await db.reviews.where('reviewedAt').aboveOrEqual(since).toArray()
  return new Set(logs.filter((l) => l.state === 0).map((l) => l.entryId)).size
}

export interface StudyStats {
  due: number
  newAvailable: number
  newToday: number
  total: number
  reviewedToday: number
}

export async function getStudyStats(): Promise<StudyStats> {
  const now = Date.now()
  const [cards, newToday, reviewedToday] = await Promise.all([
    db.cards.toArray(),
    newIntroducedToday(),
    db.reviews.where('reviewedAt').aboveOrEqual(startOfToday()).count(),
  ])
  const limit = useSettings.getState().dailyNewLimit
  const { hidden } = await loadDictionary()
  // 設定で隠している語（センシティブな単語）のカードは数えない・出さない
  const active = cards.filter((c) => !c.suspended && !hidden.has(c.entryId))
  const newCards = active.filter((c) => c.state === 0).length
  return {
    due: active.filter((c) => c.state !== 0 && c.due <= now).length,
    newAvailable: limit > 0 ? Math.min(newCards, Math.max(0, limit - newToday)) : newCards,
    newToday,
    total: cards.filter((c) => !hidden.has(c.entryId)).length,
    reviewedToday,
  }
}

/** 学習キュー: 期限切れの復習カード（期限順）→ 新規カード（追加順、1日の上限まで） */
export async function buildQueue(): Promise<StudyCard[]> {
  const now = Date.now()
  const { hidden } = await loadDictionary()
  const cards = (await db.cards.toArray()).filter((c) => !c.suspended && !hidden.has(c.entryId))
  let due = cards.filter((c) => c.state !== 0 && c.due <= now).sort((a, b) => a.due - b.due)
  const limit = useSettings.getState().dailyNewLimit
  const remainingNew = limit > 0 ? Math.max(0, limit - (await newIntroducedToday())) : Infinity
  let fresh = cards
    .filter((c) => c.state === 0)
    .sort((a, b) => a.addedAt - b.addedAt)
    .slice(0, remainingNew)
  // どのカードを出すかは期限順・追加順で決め、出す順番はランダムにする（毎回同じ順にならないように）
  due = shuffle(due)
  fresh = shuffle(fresh)
  // 新規カードを復習の間に分散させる
  const queue: StudyCard[] = []
  const step = fresh.length ? Math.max(1, Math.floor(due.length / fresh.length)) : 0
  let fi = 0
  due.forEach((c, i) => {
    queue.push(c)
    if (step && (i + 1) % step === 0 && fi < fresh.length) queue.push(fresh[fi++])
  })
  while (fi < fresh.length) queue.push(fresh[fi++])
  return queue
}

// ---------------------------------------------------------------- 新しく学ぶ・自由に練習

export type LearnSource = 'frequency' | 'recent' | 'root'

/** 学習に入っていない単語を選ぶ */
export async function pickNewWords(
  source: LearnSource,
  n: number,
  opts: { type?: 'w' | 'p'; rootId?: string } = {},
): Promise<string[]> {
  const dict = await loadDictionary()
  const existing = new Set(await db.cards.toCollection().primaryKeys())
  if (source === 'recent') {
    const views = await db.views.orderBy('viewedAt').reverse().limit(500).toArray()
    return [...new Set(views.map((v) => v.entryId))].filter((k) => !existing.has(k) && dict.byKey.has(k)).slice(0, n)
  }
  if (source === 'root') {
    const m = opts.rootId ? dict.morphById.get(opts.rootId) : undefined
    return (m?.words ?? []).filter((k) => !existing.has(k)).slice(0, n)
  }
  const type = opts.type ?? 'w'
  const start = type === 'w' ? useSettings.getState().studyStartRank : 1
  const FUNCTION = new Set(['det', 'prep', 'conj', 'pron', 'article', 'particle', 'intj', 'num'])
  return dict.entries
    .filter((e) => e.type === type && e.rank >= start && !existing.has(e.key))
    .filter((e) => type === 'p' || !e.pos.every((p) => FUNCTION.has(p)))
    .slice(0, n)
    .map((e) => e.key)
}

/** 選んだ単語をカードにしてすぐ学習を始める（1日の上限とは無関係にユーザーの操作で開始） */
export async function startLearning(keys: string[]): Promise<StudyCard[]> {
  await addManyToStudy(keys)
  const cards = await db.cards.bulkGet(keys)
  // 選ぶ語はよく使う順などで決め、出題の順番はランダムに
  return shuffle(cards.filter((c): c is StudyCard => !!c))
}

export type PracticeMode = 'random' | 'weak' | 'recent' | 'low'

/** 復習日に関係なく、学習中のカードから自由に練習。low は aheadDays 日後に思い出せる見込みの低い順 */
export async function buildPracticeQueue(mode: PracticeMode, n: number, aheadDays = 0): Promise<StudyCard[]> {
  const { hidden } = await loadDictionary()
  const cards = (await db.cards.toArray()).filter((c) => !c.suspended && !hidden.has(c.entryId))
  if (mode === 'low') return shuffle(lowRecall(cards, aheadDays).slice(0, n))
  if (mode === 'weak') {
    return shuffle(
      cards
        .filter((c) => c.state !== 0)
        .sort((a, b) => b.lapses - a.lapses || b.difficulty - a.difficulty)
        .slice(0, n),
    )
  }
  if (mode === 'recent') return shuffle(cards.sort((a, b) => b.addedAt - a.addedAt).slice(0, n))
  return shuffle(cards).slice(0, n)
}

/** 回答したことのあるカードを、aheadDays 日後に思い出せる見込みの低い順に（復習しなかった場合の推定） */
export function lowRecall(cards: StudyCard[], aheadDays: number, now = Date.now()): StudyCard[] {
  const at = new Date(now + aheadDays * 86_400_000)
  return cards
    .filter((c) => c.state !== 0 && c.last_review != null)
    .map((c) => ({ c, r: recallProbability(c, at) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.c)
}

// ---------------------------------------------------------------- 苦手な語の特訓

export interface FocusWord {
  card: StudyCard
  /** 選んだ理由 */
  reason: string
  score: number
}

/**
 * 苦手な語（何度も忘れる語・最近つまずいて、まだ別の日に思い出せていない語）を選ぶ。
 * 昔の失敗だけで選び続けないよう、最後の「もう一度」のあとに別の日に思い出せた語は点を下げる
 */
export function pickFocusWords(cards: StudyCard[], reviews: { entryId: string; rating: number; reviewedAt: number }[], now = Date.now()): FocusWord[] {
  const day = (t: number) => new Date(t).toDateString()
  const byKey = new Map<string, { rating: number; reviewedAt: number }[]>()
  for (const r of [...reviews].sort((a, b) => a.reviewedAt - b.reviewedAt)) byKey.set(r.entryId, [...(byKey.get(r.entryId) ?? []), r])
  const out: FocusWord[] = []
  for (const c of cards) {
    if (c.state === 0) continue
    const list = byKey.get(c.entryId) ?? []
    let lastAgain = -1
    list.forEach((r, i) => r.rating === 1 && (lastAgain = i))
    const recentAgain = list.filter((r) => r.rating === 1 && r.reviewedAt >= now - 28 * 86_400_000).length
    const recovered = lastAgain >= 0 && list.slice(lastAgain + 1).some((r) => r.rating >= 2 && day(r.reviewedAt) !== day(list[lastAgain].reviewedAt))
    let score = c.lapses * 2 + recentAgain * 3 + Math.max(0, c.difficulty - 6)
    if (recovered) score /= 3
    if (score < 3) continue
    const reason =
      c.lapses >= 2 ? `${c.lapses} 回忘れた` : recentAgain ? `最近 ${recentAgain} 回「もう一度」` : '難しい語'
    out.push({ card: c, reason, score })
  }
  return out.sort((a, b) => b.score - a.score)
}

export async function buildFocusQueue(n: number): Promise<StudyCard[]> {
  const { hidden } = await loadDictionary()
  const cards = (await db.cards.toArray()).filter((c) => !c.suspended && !hidden.has(c.entryId))
  const reviews = await db.reviews.toArray()
  return shuffle(pickFocusWords(cards, reviews).slice(0, n).map((x) => x.card))
}
