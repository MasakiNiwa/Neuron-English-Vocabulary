import { newCard, reviewCard } from '@/features/study/srs'
import { db, type StudyCard } from '@/lib/db'
import type { Question } from './questions'

/**
 * 語源ドリルの復習（単語の「今日の学習」とは別枠）。
 * 語源ごとに FSRS のカードを 1 枚持ち、1 回のドリルでの答えをまとめて 1 回の評価にする
 * （全問正解 → Good、1 問でも間違い → Again）
 */

/** 1 回で復習する語源の数の上限 */
export const REVIEW_LIMIT = 15

/** 期限が来た語源（期限が早い順） */
export async function dueEtyCards(now = Date.now()): Promise<StudyCard[]> {
  return db.etyCards.where('due').belowOrEqual(now).sortBy('due')
}

/** 語源ごとの前回の問題の種類（同じ種類ばかりにならないように） */
export async function lastKinds(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const rows = await db.etyReviews.where('entryId').anyOf(ids).sortBy('reviewedAt')
  for (const r of rows) out.set(r.entryId, r.kind)
  return out
}

export interface Answer {
  q: Question
  correct: boolean
  at: number
}

/**
 * 1 回分の答えを記録する。語源ごとに 1 回だけカードを進める（そのドリルの最後の答えの時刻で）。
 * 練習（1 つの語源を選んで解く）は、まだカードのない語源ならカードを作って記録する
 */
export async function saveDrill(answers: Answer[], desiredRetention: number) {
  if (!answers.length) return
  const by = new Map<string, Answer[]>()
  for (const a of answers) by.set(a.q.target, [...(by.get(a.q.target) ?? []), a])
  await db.transaction('rw', db.etyCards, db.etyReviews, async () => {
    for (const [id, as] of by) {
      const ok = as.every((a) => a.correct)
      const at = as[as.length - 1].at
      const cur = (await db.etyCards.get(id)) ?? newCard(id, as[0].at)
      // 期限前に解いた（練習で）ときも記録はするが、カードは期限が来ていたときと同じように進める
      await db.etyCards.put(reviewCard(cur, ok ? 3 : 1, new Date(at), desiredRetention))
    }
    await db.etyReviews.bulkAdd(answers.map((a) => ({ entryId: a.q.target, rating: a.correct ? 3 : 1, kind: a.q.kind, correct: a.correct, reviewedAt: a.at })))
  })
}
