/// <reference lib="webworker" />
import * as Comlink from 'comlink'
import { fsrs } from 'ts-fsrs'
import { NeuronDB } from '@/lib/db'
import type { IndexRow, Morpheme } from '@/features/dictionary/types'
import { computeAnalytics } from './compute'

/** 分析の集計を UI スレッドから切り離して実行する Worker（IndexedDB を Worker から直接読む） */
const db = new NeuronDB()
let indexCache: Promise<[IndexRow[], Morpheme[]]> | null = null

async function run(base: string, desiredRetention: number) {
  indexCache ??= Promise.all([
    fetch(new URL('data/index.json', base)).then((r) => r.json()).then((j: { e: IndexRow[] }) => j.e),
    fetch(new URL('data/morphemes.json', base)).then((r) => r.json() as Promise<Morpheme[]>),
  ])
  const [[index, morphemes], views, cards, reviews] = await Promise.all([
    indexCache,
    db.views.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
  ])
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
