/// <reference lib="webworker" />
import * as Comlink from 'comlink'
import { fsrs } from 'ts-fsrs'
import { NeuronDB } from '@/lib/db'
import type { IndexRow, Morpheme } from '@/features/dictionary/types'
import { computeAnalytics } from './compute'

/** 分析の集計を UI スレッドから切り離して実行する Worker（IndexedDB を Worker から直接読む） */
const db = new NeuronDB()
let indexCache: Promise<[IndexRow[], Morpheme[]]> | null = null

async function run(base: string, desiredRetention: number, hideSensitive = true) {
  indexCache ??= Promise.all([
    fetch(new URL('data/index.json', base)).then((r) => r.json()).then((j: { e: IndexRow[] }) => j.e),
    fetch(new URL('data/morphemes.json', base)).then((r) => r.json() as Promise<Morpheme[]>),
  ])
  const [[allIndex, allMorphemes], allViews, allCards, allReviews] = await Promise.all([
    indexCache,
    db.views.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
  ])
  // 設定で隠している語（センシティブな単語）は分析にも出さない
  const hidden = new Set(hideSensitive ? allIndex.filter((r) => r[10] === 1).map((r) => r[0]) : [])
  const keep = (k: string) => !hidden.has(k)
  const index = hidden.size ? allIndex.filter((r) => keep(r[0])) : allIndex
  const morphemes = hidden.size ? allMorphemes.map((m) => ({ ...m, words: m.words.filter(keep) })) : allMorphemes
  const views = allViews.filter((v) => keep(v.entryId))
  const cards = allCards.filter((c) => keep(c.entryId))
  const reviews = allReviews.filter((r) => keep(r.entryId))
  const f = fsrs({ request_retention: desiredRetention })
  const now = new Date()
  const retrievability: Record<string, number> = {}
  for (const c of cards) {
    if (!c.last_review) continue
    retrievability[c.entryId] = f.get_retrievability(
      {
        ...c,
        due: new Date(c.due),
        last_review: new Date(c.last_review),
      },
      now,
      false,
    ) as number
  }
  return computeAnalytics({ views, cards, reviews, index, morphemes, retrievability })
}

const api = { run }
export type AnalyticsApi = typeof api
Comlink.expose(api)
