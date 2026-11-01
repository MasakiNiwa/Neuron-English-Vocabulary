import { assetUrl } from '@/lib/appInfo'
import type { DataMeta, Entry, IndexEntry, IndexRow, Morpheme } from './types'

/**
 * 単語データの読み込み層。全て静的 JSON を fetch し、メモリにキャッシュする。
 * （PWA の Service Worker が StaleWhileRevalidate でオフライン用にもキャッシュする）
 */

export interface Dictionary {
  version: string
  entries: IndexEntry[]
  byKey: Map<string, IndexEntry>
  /** 小文字化した見出し語 → key */
  byLower: Map<string, string>
  morphemes: Morpheme[]
  morphById: Map<string, Morpheme>
}

let dictPromise: Promise<Dictionary> | null = null
const shardCache = new Map<string, Promise<Record<string, Entry>>>()

export function rowToEntry(r: IndexRow): IndexEntry {
  return { key: r[0], type: r[1] === 0 ? 'w' : 'p', rank: r[2], gloss: r[3], pos: r[4], shard: r[5], morphs: r[6], hasNote: r[7] === 1 }
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(assetUrl(path))
  if (!res.ok) throw new Error(`failed to load ${path}: ${res.status}`)
  return (await res.json()) as T
}

export function loadDictionary(): Promise<Dictionary> {
  dictPromise ??= (async () => {
    const [index, morphemes] = await Promise.all([
      fetchJson<{ v: string; e: IndexRow[] }>('data/index.json'),
      fetchJson<Morpheme[]>('data/morphemes.json'),
    ])
    const entries = index.e.map(rowToEntry)
    const byKey = new Map(entries.map((e) => [e.key, e]))
    const byLower = new Map<string, string>()
    for (const e of entries) {
      const l = e.key.toLowerCase().replace(/_/g, ' ')
      if (!byLower.has(l)) byLower.set(l, e.key)
    }
    return {
      version: index.v,
      entries,
      byKey,
      byLower,
      morphemes,
      morphById: new Map(morphemes.map((m) => [m.id, m])),
    }
  })()
  dictPromise.catch(() => (dictPromise = null))
  return dictPromise
}

export function loadMeta(): Promise<DataMeta> {
  return fetchJson<DataMeta>('data/meta.json')
}

function loadShard(shard: string) {
  let p = shardCache.get(shard)
  if (!p) {
    p = fetchJson<Record<string, Entry>>(`data/entries/${shard}.json`)
    p.catch(() => shardCache.delete(shard))
    shardCache.set(shard, p)
  }
  return p
}

export async function getEntry(key: string): Promise<Entry | null> {
  const dict = await loadDictionary()
  const ie = dict.byKey.get(key)
  if (!ie) return null
  const shard = await loadShard(ie.shard)
  return shard[key] ?? null
}

export async function getEntries(keys: string[]): Promise<Entry[]> {
  const res = await Promise.all(keys.map(getEntry))
  return res.filter((e): e is Entry => !!e)
}

/** 表示用の見出し語（熟語の _ を空白に） */
export const headword = (key: string) => key.replace(/_/g, ' ')

/** 英単語の簡易な見出し語化（活用形 → 原形）。辞書に存在する候補を返す */
export function lookupWord(dict: Dictionary, token: string): string | null {
  const w = token.toLowerCase().replace(/[’']s$/, '')
  const cands = [w]
  if (w.endsWith('ies')) cands.push(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) cands.push(w.slice(0, -2))
  if (w.endsWith('s')) cands.push(w.slice(0, -1))
  if (w.endsWith('ied')) cands.push(w.slice(0, -3) + 'y')
  if (w.endsWith('ed')) cands.push(w.slice(0, -2), w.slice(0, -1), w.slice(0, -3))
  if (w.endsWith('ing')) cands.push(w.slice(0, -3), w.slice(0, -3) + 'e', w.slice(0, -4))
  if (w.endsWith('er')) cands.push(w.slice(0, -2), w.slice(0, -1))
  if (w.endsWith('est')) cands.push(w.slice(0, -3), w.slice(0, -2))
  if (w.endsWith('ly')) cands.push(w.slice(0, -2))
  for (const c of cands) {
    const k = dict.byLower.get(c)
    if (k) return k
  }
  return null
}
