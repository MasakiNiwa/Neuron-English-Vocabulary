/// <reference lib="webworker" />
import * as Comlink from 'comlink'
import MiniSearch from 'minisearch'
import type { IndexRow, Morpheme } from './types'

/**
 * 検索 Worker。1万語超の索引構築と検索を UI スレッドから切り離す。
 *  - 英語: 完全一致 > 前方一致 > あいまい（MiniSearch の fuzzy）
 *  - 日本語: 訳語の部分一致
 *  - 語根・接辞: 綴り・意味
 */

export interface SearchHit {
  kind: 'entry' | 'morpheme'
  key: string
  score: number
}

export type SearchFilter = 'all' | 'w' | 'p' | 'm'

interface Doc {
  id: number
  head: string
}

let rows: IndexRow[] = []
let morphs: Morpheme[] = []
let mini: MiniSearch<Doc> | null = null
let ready: Promise<void> | null = null

const hasJa = (s: string) => /[぀-ヿ一-鿿]/.test(s)

function init(base: string) {
  ready ??= (async () => {
    const [idx, ms] = await Promise.all([
      fetch(new URL('data/index.json', base)).then((r) => r.json() as Promise<{ e: IndexRow[] }>),
      fetch(new URL('data/morphemes.json', base)).then((r) => r.json() as Promise<Morpheme[]>),
    ])
    rows = idx.e
    morphs = ms
    mini = new MiniSearch<Doc>({ fields: ['head'], storeFields: [], idField: 'id' })
    mini.addAll(rows.map((r, i) => ({ id: i, head: r[0].replace(/_/g, ' ') })))
  })()
  return ready
}

function search(q: string, filter: SearchFilter = 'all', limit = 200): SearchHit[] {
  const query = q.trim().toLowerCase()
  if (!query) return []
  const hits = new Map<string, SearchHit>()
  const add = (h: SearchHit) => {
    const id = h.kind + h.key
    const prev = hits.get(id)
    if (!prev || prev.score < h.score) hits.set(id, h)
  }
  const wantEntries = filter !== 'm'
  if (wantEntries) {
    if (hasJa(query)) {
      rows.forEach((r) => {
        if (filter !== 'all' && (filter === 'w') !== (r[1] === 0)) return
        const i = r[3].indexOf(query)
        if (i >= 0) add({ kind: 'entry', key: r[0], score: 50 - Math.min(i, 20) - r[2] / 1000 })
      })
    } else {
      const q2 = query.replace(/\s+/g, '_')
      rows.forEach((r) => {
        if (filter !== 'all' && (filter === 'w') !== (r[1] === 0)) return
        const k = r[0].toLowerCase()
        let s = 0
        if (k === q2) s = 100
        else if (k.startsWith(q2)) s = 70 - (k.length - q2.length) * 0.5
        else if (r[1] === 1 && k.includes(q2)) s = 40
        if (s) add({ kind: 'entry', key: r[0], score: s - r[2] / 2000 })
      })
      if (query.length >= 3 && mini) {
        for (const res of mini.search(query, { fuzzy: 0.2, prefix: true }).slice(0, 50)) {
          const r = rows[res.id as number]
          if (filter !== 'all' && (filter === 'w') !== (r[1] === 0)) continue
          add({ kind: 'entry', key: r[0], score: Math.min(35, res.score * 3) - r[2] / 2000 })
        }
      }
    }
  }
  if (filter === 'all' || filter === 'm') {
    const qq = query.replace(/^-|-$/g, '')
    for (const m of morphs) {
      let s = 0
      if (m.label === qq || m.forms.includes(qq)) s = 90
      else if (m.forms.some((f) => f.startsWith(qq))) s = 45
      else if (m.meaning.ja.includes(query)) s = 48
      if (s) add({ kind: 'morpheme', key: m.id, score: s + Math.min(m.words.length, 50) / 100 })
    }
  }
  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

const api = { init, search }
export type SearchApi = typeof api
Comlink.expose(api)
