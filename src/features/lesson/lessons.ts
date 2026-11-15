import type { Dictionary } from '@/features/dictionary/data'
import type { Entry, IndexEntry, Morpheme } from '@/features/dictionary/types'
import type { RootLesson } from '@/lib/db'
import { glossWords } from '@/features/study/choices'

/**
 * 語根レッスン: 1 つの語根と、それを使う単語をまとめて学ぶ。
 * 単語ごとに「部品の意味」から単語の意味を当てるクイズにして、語源で推測する体験を作る。
 */

/** 1 レッスンで扱う単語の数 */
export const LESSON_SIZE = 6
/** レッスンにできる語根の条件（単語が 5 語以上ある語根） */
export const MIN_WORDS = 5

/** 語根の単語（単語のみ・よく使う順） */
export function rootWords(dict: Dictionary, m: Morpheme): IndexEntry[] {
  return m.words
    .map((k) => dict.byKey.get(k))
    .filter((e): e is IndexEntry => !!e && e.type === 'w')
    .sort((a, b) => a.rank - b.rank)
}

/** レッスンにできる語根（よく使う単語を含む順。上位の単語の頻度順位の平均が小さいほど先） */
export function lessonRoots(dict: Dictionary): Morpheme[] {
  const scored = dict.morphemes
    .filter((m) => m.type === 'root')
    .map((m) => {
      const ws = rootWords(dict, m)
      const top = ws.slice(0, LESSON_SIZE)
      return { m, n: ws.length, score: top.length ? top.reduce((s, e) => s + e.rank, 0) / top.length : Infinity }
    })
    .filter((x) => x.n >= MIN_WORDS)
  return scored.sort((a, b) => a.score - b.score || a.m.label.localeCompare(b.m.label)).map((x) => x.m)
}

/** 図鑑で「この語根の単語」として数える語（よく使う順に最大 TARGET_SIZE 語） */
export const TARGET_SIZE = 18

export function targetWords(dict: Dictionary, m: Morpheme): IndexEntry[] {
  return rootWords(dict, m).slice(0, TARGET_SIZE)
}

/**
 * レッスンで出題する単語（LESSON_SIZE 語）。まだレッスンで正解していない語を先に（よく使う順）、
 * 足りない分は正解したことのある語で埋める。レッスンを重ねると、語根の単語を順にめぐれる
 */
export function lessonWords(dict: Dictionary, m: Morpheme, mastered: ReadonlySet<string> = new Set()): IndexEntry[] {
  const ws = targetWords(dict, m)
  const fresh = ws.filter((e) => !mastered.has(e.key))
  const known = ws.filter((e) => mastered.has(e.key))
  return [...fresh, ...known].slice(0, LESSON_SIZE)
}

/** レッスンで正解したことのある語。v2.6 までの記録（correctKeys がない）で満点だったときは、そのとき出したよく使う順の語 */
export function masteredKeys(dict: Dictionary, m: Morpheme, record: RootLesson | undefined | null): Set<string> {
  if (!record) return new Set()
  if (record.correctKeys) return new Set(record.correctKeys)
  return record.best >= record.total && record.total > 0 ? new Set(rootWords(dict, m).slice(0, record.total).map((e) => e.key)) : new Set()
}

/**
 * 語根図鑑の段階（★の数）
 * - ★1 出会った: レッスンを 1 回終えた
 * - ★2 見わけられる: この語根の単語（よく使う順に最大 TARGET_SIZE 語）を、すべてレッスンで正解した
 * - ★3 身についた: ★2 に加えて、その語の半分以上を、学習で日をあけて思い出せた
 */
export interface RootProgress {
  stage: 0 | 1 | 2 | 3
  target: number
  mastered: number
  recalled: number
  /** ★3 に必要な「日をあけて思い出せた」語の数 */
  recallNeed: number
}

export function rootProgress(dict: Dictionary, m: Morpheme, record: RootLesson | undefined | null, recalledKeys: ReadonlySet<string>): RootProgress {
  const target = targetWords(dict, m)
  const done = masteredKeys(dict, m, record)
  const mastered = target.filter((e) => done.has(e.key)).length
  const recalled = target.filter((e) => recalledKeys.has(e.key)).length
  const recallNeed = Math.ceil(target.length / 2)
  const stage = !record ? 0 : mastered < target.length ? 1 : recalled < recallNeed ? 2 : 3
  return { stage, target: target.length, mastered, recalled, recallNeed }
}

export const STAGE_LABEL = ['まだ', '出会った', '見わけられる', '身についた'] as const

/** 日をあけて思い出せた語（最後の回答が「難しい」以上で、その語を初めて回答した日とは別の日） */
export function recalledAfterGap(reviews: { entryId: string; rating: number; reviewedAt: number }[]): Set<string> {
  const day = (t: number) => new Date(t).toDateString()
  const first = new Map<string, number>()
  const last = new Map<string, { rating: number; reviewedAt: number }>()
  for (const r of reviews) {
    if ((first.get(r.entryId) ?? Infinity) > r.reviewedAt) first.set(r.entryId, r.reviewedAt)
    const l = last.get(r.entryId)
    if (!l || l.reviewedAt <= r.reviewedAt) last.set(r.entryId, r)
  }
  const out = new Set<string>()
  for (const [k, l] of last) if (l.rating >= 2 && day(l.reviewedAt) !== day(first.get(k)!)) out.add(k)
  return out
}

export interface Choice {
  text: string
  correct: boolean
}

/**
 * 意味を当てる 4 択。誤答はまず同じレッスンの別の単語の訳から（同じ語根でも、ほかの部品で意味が変わることに気づけるように）、
 * 足りなければ頻度の近い単語から選ぶ。正解と同じ訳を含む候補は使わない
 */
export function lessonChoices(target: IndexEntry, entry: Entry | null, lesson: IndexEntry[], all: IndexEntry[], random: () => number = Math.random): Choice[] {
  const correct = target.gloss
  const correctWords = new Set([...glossWords(correct), ...(entry?.g.flatMap((g) => g.ja.flatMap(glossWords)) ?? [])])
  const ok = (e: IndexEntry) => e.key !== target.key && !!e.gloss && e.gloss !== correct && !glossWords(e.gloss).some((w) => correctWords.has(w))
  const picks: string[] = []
  const take = (pool: IndexEntry[], max: number) => {
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    for (const e of shuffled) {
      if (picks.length >= max) break
      if (ok(e) && !picks.includes(e.gloss)) picks.push(e.gloss)
    }
  }
  take(lesson, 2)
  take(
    all.filter((e) => e.type === 'w' && Math.abs(e.rank - target.rank) < 1500),
    3,
  )
  const out = picks.map((text) => ({ text, correct: false }))
  out.splice(Math.floor(random() * (out.length + 1)), 0, { text: correct, correct: true })
  return out
}
