import type { ReviewRecord, StudyCard } from '@/lib/db'
import type { ConcreteFormat } from './formatDefs'
import { recallProbability, replay7 } from './srs'

/**
 * スキル別の見込み（読む・聞く・書く・話す）。
 *
 * 復習の予定は今までどおり単語ごとに 1 つ（カード）。それとは別に、そのスキルの出題形式で答えた回答だけを
 * FSRS-7 でたどり直して、スキルごとの記憶の状態を出す（保存はしない。回答の記録から毎回計算する）。
 * FSRS は「読む練習が聞く力も伸ばす」といったスキル間の影響を扱えないので、あまり練習していないスキルは
 * 実際より低めに出る。目安として見せ、復習の予定には使わない
 */

export type Skill = 'read' | 'listen' | 'write' | 'speak'

export const SKILLS: Skill[] = ['read', 'listen', 'write', 'speak']

export const SKILL_LABEL: Record<Skill, string> = { read: '読む', listen: '聞く', write: '書く', speak: '話す' }

/** 出題形式 → スキル（聞いて書くは、聞き取れるかが主なので「聞く」） */
export const SKILL_OF: Record<ConcreteFormat, Skill> = {
  en2ja: 'read',
  choice: 'read',
  listen: 'listen',
  dictation: 'listen',
  ja2en: 'write',
  cloze: 'write',
  speak: 'speak',
}

export const SKILL_HINT: Record<Skill, string> = {
  read: '英→日・4択',
  listen: '聞いて意味・聞いて書く',
  write: '日→英・穴埋め',
  speak: '発音',
}

/** 回答の記録の mode（"review:en2ja" など）からスキルを読む。形式が分からなければ null */
export function skillOfLog(l: Pick<ReviewRecord, 'mode'>): Skill | null {
  const fmt = (l.mode ?? '').split(':')[1] as ConcreteFormat | undefined
  return (fmt && SKILL_OF[fmt]) ?? null
}

/** カードの今の回の回答（削除して追加し直す前の回答は含めない）。古い順 */
export function logsOfRun(c: StudyCard, logs: ReviewRecord[]): ReviewRecord[] {
  return logs
    .filter((l) => l.entryId === c.entryId && (c.run && l.run ? l.run === c.run : l.reviewedAt >= c.addedAt - 60_000))
    .sort((a, b) => a.reviewedAt - b.reviewedAt || (a.id ?? 0) - (b.id ?? 0))
}

export interface SkillState {
  skill: Skill
  /** そのスキルで答えた回数 */
  answers: number
  /** そのスキルの回答だけで作った仮のカード（見込み・曲線の計算用。保存はしない）。回答がなければ null */
  card: StudyCard | null
}

/** スキルごとの記憶の状態。logs はそのカードの今の回の回答（logsOfRun） */
export function skillStates(c: StudyCard, logs: ReviewRecord[]): Record<Skill, SkillState> {
  const out = {} as Record<Skill, SkillState>
  for (const skill of SKILLS) {
    const mine = logs.filter((l) => skillOfLog(l) === skill && l.rating >= 1 && l.rating <= 4)
    let card: StudyCard | null = null
    if (mine.length) {
      const s = replay7(mine.map((l) => ({ rating: l.rating, reviewedAt: l.reviewedAt })))
      if (s) {
        const last = mine[mine.length - 1]
        card = {
          ...c,
          model: 7,
          state: 2,
          stability: s.stability,
          stabilityFast: s.stabilityFast,
          difficulty: s.difficulty,
          last_review: last.reviewedAt,
          reps: mine.length,
          lapses: mine.filter((l) => l.rating === 1).length,
        }
      }
    }
    out[skill] = { skill, answers: mine.length, card }
  }
  return out
}

/** スキルごとの、at の時点で思い出せる見込み（0〜1）。回答のないスキルは null */
export function skillRecall(c: StudyCard, logs: ReviewRecord[], at: Date = new Date()): Record<Skill, number | null> {
  const st = skillStates(c, logs)
  const out = {} as Record<Skill, number | null>
  for (const s of SKILLS) out[s] = st[s].card ? recallProbability(st[s].card!, at) : null
  return out
}

/** 全カードのスキル別の見込み（回答の記録をカードごとにまとめてから計算する） */
export function allSkillRecall(cards: StudyCard[], reviews: ReviewRecord[], at: Date = new Date()): Map<string, Record<Skill, number | null>> {
  const byKey = new Map<string, ReviewRecord[]>()
  for (const r of reviews) {
    const l = byKey.get(r.entryId)
    if (l) l.push(r)
    else byKey.set(r.entryId, [r])
  }
  const out = new Map<string, Record<Skill, number | null>>()
  for (const c of cards) {
    if (c.state === 0) continue
    out.set(c.entryId, skillRecall(c, logsOfRun(c, byKey.get(c.entryId) ?? []), at))
  }
  return out
}
