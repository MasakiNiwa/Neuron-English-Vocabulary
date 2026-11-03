import type { Entry, IndexEntry } from '@/features/dictionary/types'

/** 訳を語ごとに分けて比べやすくする（「〜」や括弧書きを外す） */
export function glossWords(s: string): string[] {
  return s
    .split(/[、,，;；/・]/)
    .map((w) => w.replace(/[（(][^）)]*[）)]/g, '').replace(/[〜~…\s]/g, '').trim())
    .filter((w) => w.length > 0)
}

/**
 * 4 択の誤答を選ぶ（ROADMAP B06）。
 * - 正解と同じ訳の語を 1 つでも含む候補、類義語・反義語・派生語、同じ表示の候補は除く
 * - 正解の表示は誤答と同じ形式（索引の訳）にして、長さで正解が分からないようにする
 * - 頻度が近い語から選び、足りなければ範囲を広げる。それでも足りなければある分だけ返す（止まらない）
 */
export function buildChoices(entry: Entry, entries: IndexEntry[], random: () => number = Math.random) {
  const self = entries.find((e) => e.key === entry.k)
  const correct = self?.gloss || entry.g[0]?.ja.slice(0, 3).join('、') || ''
  const correctWords = new Set([...entry.g.flatMap((g) => g.ja.flatMap(glossWords)), ...glossWords(correct)])
  const related = new Set([entry.k, ...(entry.syn ?? []), ...(entry.ant ?? []), ...(entry.der ?? []), ...(entry.comp ?? [])].map((k) => k.toLowerCase()))
  const ok = (e: IndexEntry) =>
    e.type === entry.t && !!e.gloss && e.gloss !== correct && !related.has(e.key.toLowerCase()) && !glossWords(e.gloss).some((w) => correctWords.has(w))

  const picks: string[] = []
  const seen = new Set<string>([correct])
  for (const width of [800, 3000, Infinity]) {
    const pool = entries.filter((e) => Math.abs(e.rank - entry.r) < width && ok(e))
    // シャッフルしてから重複のない訳を選ぶ
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    for (const e of pool) {
      if (picks.length >= 3) break
      if (seen.has(e.gloss)) continue
      seen.add(e.gloss)
      picks.push(e.gloss)
    }
    if (picks.length >= 3) break
  }
  const all = picks.map((text) => ({ text, correct: false }))
  all.splice(Math.floor(random() * (all.length + 1)), 0, { text: correct, correct: true })
  return all
}
