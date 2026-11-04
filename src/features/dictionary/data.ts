import { assetUrl } from '@/lib/appInfo'
import type { DataMeta, Entry, IndexEntry, IndexRow, Morpheme, ToeicLevel } from './types'

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
/** 読み込んだ索引の版。詳細データ・形態素の URL に付けて、キャッシュ上で索引と版が食い違わないようにする（ROADMAP T01） */
let dataVersion = ''
const shardCache = new Map<string, Promise<Record<string, Entry>>>()

export function rowToEntry(r: IndexRow): IndexEntry {
  return {
    key: r[0],
    type: r[1] === 0 ? 'w' : 'p',
    rank: r[2],
    gloss: r[3],
    pos: r[4],
    shard: r[5],
    morphs: r[6],
    hasNote: r[7] === 1,
    ...(r[8] ? { toeic: r[8] as ToeicLevel } : {}),
    ...(r[9] === 1 ? { tsl: true } : {}),
  }
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(assetUrl(path))
  if (!res.ok) throw new Error(`failed to load ${path}: ${res.status}`)
  return (await res.json()) as T
}

export function loadDictionary(): Promise<Dictionary> {
  dictPromise ??= (async () => {
    const index = await fetchJson<{ v: string; e: IndexRow[] }>('data/index.json')
    dataVersion = index.v
    const morphemes = await fetchJson<Morpheme[]>(`data/morphemes.json?v=${index.v}`)
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
    p = fetchJson<Record<string, Entry>>(shardPath(shard))
    p.catch(() => shardCache.delete(shard))
    shardCache.set(shard, p)
  }
  return p
}

function shardPath(shard: string) {
  return `data/entries/${shard}.json${dataVersion ? `?v=${dataVersion}` : ''}`
}

/**
 * オフライン用に辞書の詳細データをすべて取得する（Service Worker がキャッシュする）。
 * メモリには保持せず、取得だけして捨てる。onProgress(済み, 全体)
 */
export async function prefetchAllShards(onProgress?: (done: number, total: number) => void, signal?: AbortSignal) {
  const dict = await loadDictionary()
  const shards = [...new Set(dict.entries.map((e) => e.shard))].sort()
  let done = 0
  onProgress?.(0, shards.length)
  // 同時に 4 本まで
  const queue = [...shards]
  const worker = async () => {
    while (queue.length) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      const s = queue.shift()!
      const res = await fetch(assetUrl(shardPath(s)), { signal })
      if (!res.ok) throw new Error(`failed to load ${s}: ${res.status}`)
      await res.arrayBuffer()
      onProgress?.(++done, shards.length)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return shards.length
}

/** 今の版の詳細データのうち、オフライン用キャッシュにあるシャードの数（Service Worker がないときは null） */
export async function countCachedShards(): Promise<{ cached: number; total: number } | null> {
  if (!('caches' in window) || !navigator.serviceWorker?.controller) return null
  const dict = await loadDictionary()
  const total = new Set(dict.entries.map((e) => e.shard)).size
  const cache = await caches.open('nev-data')
  const keys = await cache.keys()
  const cached = keys.filter((r) => r.url.includes('/data/entries/') && r.url.includes(`v=${dataVersion}`)).length
  return { cached, total }
}

export async function getEntry(key: string): Promise<Entry | null> {
  const dict = await loadDictionary()
  const ie = dict.byKey.get(key)
  if (!ie) return null
  const shard = await loadShard(ie.shard)
  const v = (shard as unknown as { _v?: string })._v
  // 索引と詳細データの版が食い違う（キャッシュに古い索引が残ったまま、新しい詳細データを取った等）か、語が見つからない。
  // URL に版を付けても、サーバーには最新のファイルしかないので、食い違いは「見つけて取り直す」ことで防ぐ（レビュー B03）
  if ((v && dataVersion && v !== dataVersion) || !shard[key]) return getEntryFresh(key)
  return shard[key] ?? null
}

/** キャッシュを通さずに最新の索引と詳細データを取り直して、語を探す。アプリには「辞書が更新された」と知らせる */
async function getEntryFresh(key: string): Promise<Entry | null> {
  try {
    const bust = `fresh=${Date.now()}`
    const index = await fetchJson<{ v: string; e: IndexRow[] }>(`data/index.json?${bust}`)
    const row = index.e.find((r) => r[0] === key)
    if (!row) return null
    const shard = await fetchJson<Record<string, Entry>>(`data/entries/${row[5]}.json?v=${index.v}&${bust}`)
    if (index.v !== dataVersion) notifyOutdated()
    return shard[key] ?? null
  } catch {
    return null // オフラインなど。取り直せないときは見つからない扱い
  }
}

const outdatedListeners = new Set<() => void>()
let outdated = false
function notifyOutdated() {
  if (outdated) return
  outdated = true
  outdatedListeners.forEach((f) => f())
}
/** 辞書データが新しい版に更新されたことを知る（再読み込みを促す表示用） */
export function onDataOutdated(f: () => void) {
  if (outdated) f()
  outdatedListeners.add(f)
  return () => void outdatedListeners.delete(f)
}

export async function getEntries(keys: string[]): Promise<Entry[]> {
  const res = await Promise.all(keys.map(getEntry))
  return res.filter((e): e is Entry => !!e)
}

/** 表示用の見出し語（熟語の _ を空白に） */
export const headword = (key: string) => key.replace(/_/g, ' ')

/** 規則で戻せない活用形・代名詞（「is → I」「his → hi」のような誤リンクを防ぐ。ROADMAP B04） */
const IRREGULAR: Record<string, string> = {
  is: 'be', am: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be', "isn't": 'be', "aren't": 'be', "wasn't": 'be',
  has: 'have', had: 'have', having: 'have', does: 'do', did: 'do', done: 'do', doing: 'do',
  his: 'he', him: 'he', her: 'she', hers: 'she', its: 'it', us: 'we', our: 'we', ours: 'we', them: 'they', their: 'they', theirs: 'they',
  me: 'I', my: 'I', mine: 'I', your: 'you', yours: 'you',
  went: 'go', gone: 'go', goes: 'go', better: 'good', best: 'good', worse: 'bad', worst: 'bad',
  children: 'child', men: 'man', women: 'woman', people: 'person', feet: 'foot', teeth: 'tooth', mice: 'mouse',
}

/** 語尾を外した結果として認める最短の長さ（短すぎると別の語に化ける: best → be, her → he） */
const MIN_STEM = 3

/** 英単語の簡易な見出し語化（活用形 → 原形）。辞書に存在する候補を返す */
export function lookupWord(dict: Dictionary, token: string): string | null {
  const w = token.toLowerCase().replace(/[’']s$/, '')
  const exact = dict.byLower.get(w)
  if (exact) return exact
  const irr = IRREGULAR[w]
  if (irr) return dict.byLower.get(irr.toLowerCase()) ?? null
  const cands: string[] = []
  if (w.endsWith('ies')) cands.push(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) cands.push(w.slice(0, -2))
  if (w.endsWith('s') && !w.endsWith('ss')) cands.push(w.slice(0, -1))
  if (w.endsWith('ied')) cands.push(w.slice(0, -3) + 'y')
  // used → use（us ではない）、united → unite（unit ではない）のように、e を残す候補を先に見る
  if (w.endsWith('ed')) cands.push(w.slice(0, -1), w.slice(0, -2), w.slice(0, -3))
  if (w.endsWith('ing')) cands.push(w.slice(0, -3), w.slice(0, -3) + 'e', w.slice(0, -4))
  if (w.endsWith('er')) cands.push(w.slice(0, -2), w.slice(0, -1))
  if (w.endsWith('est')) cands.push(w.slice(0, -3), w.slice(0, -2))
  if (w.endsWith('ly')) cands.push(w.slice(0, -2))
  for (const c of cands) {
    if (c.length < MIN_STEM) continue
    const k = dict.byLower.get(c)
    if (k) return k
  }
  return null
}
