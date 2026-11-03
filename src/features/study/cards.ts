import { useLiveQuery } from 'dexie-react-hooks'
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs'
import { db, type StudyCard } from '@/lib/db'
import { useSettings } from '@/stores/settings'

export { Rating }
export type { Grade }

/** FSRS スケジューラ（目標記憶保持率は設定から） */
export function scheduler() {
  const { desiredRetention } = useSettings.getState()
  return fsrs(generatorParameters({ request_retention: desiredRetention, enable_fuzz: true, enable_short_term: true }))
}

export function toCard(c: StudyCard): Card {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  }
}

export function fromCard(entryId: string, card: Card, addedAt: number): StudyCard {
  return {
    entryId,
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
    addedAt,
  }
}

export async function addToStudy(entryId: string) {
  if (await db.cards.get(entryId)) return
  const now = Date.now()
  await db.cards.put(fromCard(entryId, createEmptyCard(new Date(now)), now))
}

export async function addManyToStudy(entryIds: string[]) {
  const existing = new Set(await db.cards.where('entryId').anyOf(entryIds).primaryKeys())
  const now = Date.now()
  const rows = entryIds
    .filter((id) => !existing.has(id))
    .map((id, i) => fromCard(id, createEmptyCard(new Date(now)), now + i))
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
    const { card, log } = scheduler().next(toCard(c), now, rating)
    await db.cards.put({ ...fromCard(entryId, card, c.addedAt), suspended: c.suspended })
    await db.reviews.add({
      entryId,
      rating,
      state: log.state,
      reviewedAt: now.getTime(),
      durationMs: opts.durationMs,
      mode: opts.mode,
      stability: card.stability,
      difficulty: card.difficulty,
    })
  })
}

/** 各評価を選んだ場合の次回間隔（ボタンに表示） */
export function previewIntervals(c: StudyCard): Record<Grade, Date> {
  const rec = scheduler().repeat(toCard(c), new Date())
  return {
    [Rating.Again]: rec[Rating.Again].card.due,
    [Rating.Hard]: rec[Rating.Hard].card.due,
    [Rating.Good]: rec[Rating.Good].card.due,
    [Rating.Easy]: rec[Rating.Easy].card.due,
  } as Record<Grade, Date>
}

/** 現在の想起確率 (0..1) */
export function retrievability(c: StudyCard, now = new Date()): number {
  if (!c.last_review) return 0
  return scheduler().get_retrievability(toCard(c), now, false) as number
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
