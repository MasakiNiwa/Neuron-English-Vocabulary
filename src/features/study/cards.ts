import { useLiveQuery } from 'dexie-react-hooks'
import { Rating, type Grade } from 'ts-fsrs'
import { db, type StudyCard } from '@/lib/db'
import { useSettings } from '@/stores/settings'
import { modelOf, newCard, previewDue, recallProbability, reviewCard } from './srs'

export { Rating }
export type { Grade }

/** 単語を学習に追加する（新しいカードは FSRS-7） */
export async function addToStudy(entryId: string) {
  if (await db.cards.get(entryId)) return
  await db.cards.put(newCard(entryId, Date.now()))
}

export async function addManyToStudy(entryIds: string[]) {
  const existing = new Set(await db.cards.where('entryId').anyOf(entryIds).primaryKeys())
  const now = Date.now()
  // addedAt は追加した順に並べるために 1 ミリ秒ずつずらす（カードを作った時刻は now）
  const rows = entryIds.filter((id) => !existing.has(id)).map((id, i) => newCard(id, now, now + i))
  await db.cards.bulkPut(rows)
  return rows.length
}

export async function removeFromStudy(entryId: string) {
  await db.cards.delete(entryId)
}

/** 評価して次回の復習日を更新 */
export async function review(entryId: string, rating: Grade, opts: { durationMs?: number; mode?: string } = {}) {
  // カードの読み込みから書き込みまでを 1 つのトランザクションで行い、同時に 2 回呼ばれても
  // 古いカードを元に 2 回計算することがないようにする（B02）
  await db.transaction('rw', db.cards, db.reviews, async () => {
    const c = await db.cards.get(entryId)
    if (!c) return
    const now = new Date()
    const next = reviewCard(c, rating, now, useSettings.getState().desiredRetention)
    await db.cards.put(next)
    await db.reviews.add({
      entryId,
      rating,
      // 回答する前の状態（0 = 初めての回答）
      state: c.state,
      reviewedAt: now.getTime(),
      durationMs: opts.durationMs,
      mode: opts.mode,
      stability: next.stability,
      difficulty: next.difficulty,
      model: modelOf(c),
      recall: c.state === 0 ? undefined : recallProbability(c, now),
      run: c.run,
      uid: crypto.randomUUID(),
    })
  })
}

/** 各評価を選んだ場合の次回の期限（ボタンに表示） */
export function previewIntervals(c: StudyCard): Record<Grade, Date> {
  return previewDue(c, new Date(), useSettings.getState().desiredRetention)
}

/** 現在の想起確率 (0..1) */
export function retrievability(c: StudyCard, now = new Date()): number {
  return recallProbability(c, now)
}

/** null=未登録, undefined=読み込み中 */
export function useStudyCard(entryId: string) {
  return useLiveQuery(async () => (await db.cards.get(entryId)) ?? null, [entryId])
}

export function formatInterval(due: Date, now = new Date()): string {
  const min = Math.round((due.getTime() - now.getTime()) / 60000)
  if (min < 60) return `${Math.max(1, min)}分`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}時間`
  const d = Math.round(h / 24)
  if (d < 31) return `${d}日`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo}ヶ月`
  return `${(d / 365).toFixed(1)}年`
}
