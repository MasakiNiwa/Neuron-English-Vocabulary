import type { StudyCard } from '@/lib/db'
import { recallProbability } from '@/features/study/srs'

/**
 * 語源のページの「この語源の単語の覚え具合」: その語源を含む単語の学習カード・回答から、
 * 全体（学習中のすべての単語）と比べて苦手な傾向があるかを見る
 */

export interface WordStat {
  key: string
  recall: number
  lapses: number
}

export interface GroupStats {
  /** 学習中（一度以上答えた）の語の数 */
  learned: number
  /** 今の思い出せる見込みの平均 */
  avgRecall: number | null
  /** 最近（90 日）の回答のうち「もう一度」の割合 */
  againRate: number | null
  /** 最近の回答の数 */
  answers: number
  /** 見込みの低い順 */
  words: WordStat[]
}

export const RECENT_DAYS = 90
/** 傾向を言うのに必要な語の数・回答の数 */
export const MIN_WORDS = 3
export const MIN_ANSWERS = 10

interface Log {
  entryId: string
  rating: number
  reviewedAt: number
}

export function groupStats(cards: StudyCard[], logs: Log[], now: number, keys?: ReadonlySet<string>): GroupStats {
  const cs = cards.filter((c) => c.state !== 0 && c.last_review != null && (!keys || keys.has(c.entryId)))
  const words = cs.map((c) => ({ key: c.entryId, recall: recallProbability(c, new Date(now)), lapses: c.lapses })).sort((a, b) => a.recall - b.recall)
  const since = now - RECENT_DAYS * 86_400_000
  const ls = logs.filter((l) => l.reviewedAt >= since && (!keys || keys.has(l.entryId)))
  return {
    learned: cs.length,
    avgRecall: words.length ? words.reduce((s, w) => s + w.recall, 0) / words.length : null,
    againRate: ls.length ? ls.filter((l) => l.rating === 1).length / ls.length : null,
    answers: ls.length,
    words,
  }
}

export type Tendency = 'weak' | 'strong' | 'even' | 'unknown'

/**
 * 全体と比べた傾向。語が少ない・回答が少ないうちは unknown。
 * 見込みの平均が全体より 5 ポイント以上低い、または「もう一度」の割合が全体の 1.3 倍以上（かつ 5 ポイント以上多い）なら苦手、逆なら得意
 */
export function tendency(g: GroupStats, all: GroupStats): Tendency {
  if (g.learned < MIN_WORDS || g.avgRecall === null || all.avgRecall === null) return 'unknown'
  const enough = g.answers >= MIN_ANSWERS && g.againRate !== null && all.againRate !== null
  const lowRecall = g.avgRecall <= all.avgRecall - 0.05
  const highRecall = g.avgRecall >= all.avgRecall + 0.05
  const moreAgain = enough && g.againRate! >= all.againRate! * 1.3 && g.againRate! - all.againRate! >= 0.05
  const lessAgain = enough && g.againRate! <= all.againRate! * 0.7 && all.againRate! - g.againRate! >= 0.05
  if (lowRecall || moreAgain) return 'weak'
  if ((highRecall && !moreAgain) || (lessAgain && !lowRecall)) return 'strong'
  return 'even'
}
