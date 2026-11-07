import { db, type StudyCard } from '@/lib/db'
import { useSettings } from '@/stores/settings'
import { loadDictionary } from '@/features/dictionary/data'
import { addManyToStudy } from './cards'

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
  // 設定で隠している語（卑語・性的な語）のカードは数えない・出さない
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

export type PracticeMode = 'random' | 'weak' | 'recent'

/** 復習日に関係なく、学習中のカードから自由に練習 */
export async function buildPracticeQueue(mode: PracticeMode, n: number): Promise<StudyCard[]> {
  const { hidden } = await loadDictionary()
  const cards = (await db.cards.toArray()).filter((c) => !c.suspended && !hidden.has(c.entryId))
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
