import { db, type StudyCard } from '@/lib/db'
import { useSettings } from '@/stores/settings'
import { loadDictionary } from '@/features/dictionary/data'
import { addManyToStudy } from './cards'

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
  const active = cards.filter((c) => !c.suspended)
  const newCards = active.filter((c) => c.state === 0).length
  return {
    due: active.filter((c) => c.state !== 0 && c.due <= now).length,
    newAvailable: Math.min(newCards, Math.max(0, limit - newToday)),
    newToday,
    total: cards.length,
    reviewedToday,
  }
}

/** 学習キュー: 期限切れの復習カード（期限順）→ 新規カード（追加順、1日の上限まで） */
export async function buildQueue(): Promise<StudyCard[]> {
  const now = Date.now()
  const cards = (await db.cards.toArray()).filter((c) => !c.suspended)
  const due = cards.filter((c) => c.state !== 0 && c.due <= now).sort((a, b) => a.due - b.due)
  const limit = useSettings.getState().dailyNewLimit
  const remainingNew = Math.max(0, limit - (await newIntroducedToday()))
  const fresh = cards
    .filter((c) => c.state === 0)
    .sort((a, b) => a.addedAt - b.addedAt)
    .slice(0, remainingNew)
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

/** 頻度順で、まだ学習に入っていない単語を n 件追加 */
export async function addNextFrequentWords(n: number, type: 'w' | 'p' = 'w') {
  const dict = await loadDictionary()
  const existing = new Set(await db.cards.toCollection().primaryKeys())
  const start = type === 'w' ? useSettings.getState().studyStartRank : 1
  const FUNCTION = new Set(['det', 'prep', 'conj', 'pron', 'article', 'particle', 'intj', 'num'])
  const keys = dict.entries
    .filter((e) => e.type === type && e.rank >= start && !existing.has(e.key))
    .filter((e) => type === 'p' || !e.pos.every((p) => FUNCTION.has(p)))
    .slice(0, n)
    .map((e) => e.key)
  return addManyToStudy(keys)
}
