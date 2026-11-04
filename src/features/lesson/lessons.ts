import type { Dictionary } from '@/features/dictionary/data'
import type { Entry, IndexEntry, Morpheme } from '@/features/dictionary/types'
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

/** レッスンで出題する単語（よく使う順に LESSON_SIZE 語） */
export function lessonWords(dict: Dictionary, m: Morpheme): IndexEntry[] {
  return rootWords(dict, m).slice(0, LESSON_SIZE)
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

/** 結果の段階（図鑑の表示用） */
export function stars(correct: number, total: number): 0 | 1 | 2 | 3 {
  if (!total) return 0
  const r = correct / total
  return r >= 1 ? 3 : r >= 0.65 ? 2 : 1
}
