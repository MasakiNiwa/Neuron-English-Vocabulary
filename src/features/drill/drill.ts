import { newCard, reviewCard } from '@/features/study/srs'
import { db, type StudyCard } from '@/lib/db'
import type { Grade } from 'ts-fsrs'
import type { Question } from './questions'

/**
 * 語源ドリルの復習（単語の「今日の学習」とは別枠）。
 * 語源ごとに FSRS のカードを 1 枚持ち、1 回のドリルでの答えをまとめて 1 回の評価にする
 * （自分で選んだ評価のうち、いちばん低いもの）
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
  /** 自分で選んだ評価（1 もう一度・2 難しい・3 正解・4 簡単） */
  rating: Grade
  at: number
}

/** 思い出せた（難しい以上） */
export const recalled = (a: Pick<Answer, 'rating'>) => a.rating >= 2

/**
 * 1 回分の答えを記録する。語源ごとに 1 回だけカードを進める（そのドリルでいちばん低い評価で、最後に答えた時刻に）。
 * まだカードのない語源ならカードを作る
 */
export async function saveDrill(answers: Answer[], desiredRetention: number) {
  if (!answers.length) return
  const by = new Map<string, Answer[]>()
  for (const a of answers) by.set(a.q.target, [...(by.get(a.q.target) ?? []), a])
  await db.transaction('rw', db.etyCards, db.etyReviews, async () => {
    for (const [id, as] of by) {
      const grade = Math.min(...as.map((a) => a.rating)) as Grade
      const at = as[as.length - 1].at
      const cur = (await db.etyCards.get(id)) ?? newCard(id, as[0].at)
      await db.etyCards.put(reviewCard(cur, grade, new Date(at), desiredRetention))
    }
    await db.etyReviews.bulkAdd(answers.map((a) => ({ entryId: a.q.target, rating: a.rating, kind: a.q.kind, correct: recalled(a), reviewedAt: a.at })))
  })
}
