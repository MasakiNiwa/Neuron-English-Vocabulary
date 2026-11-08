import type { Dictionary } from '@/features/dictionary/data'
import type { MorphemeType } from '@/features/dictionary/types'

/**
 * 2 つの単語・語根をつなぐ道を探す（語源のつながりだけを使う）。
 * 点: "e:<key>"（単語・熟語） / "m:<id>"（語根・接頭辞・祖語・不変化詞）
 * 線: 単語 ↔ 含む語根、語根 ↔ 語源の語源（成り立ち・祖語ファミリー）
 * 接尾辞（-tion など）はほとんどの語をつないでしまい意味のある道にならないので使わない。
 * 接頭辞（com- など）も同じ理由で通りにくくして、語根を通る道を選びやすくする
 */

const MORPH_COST: Record<MorphemeType, number> = { root: 1, pie: 1.5, particle: 2, prefix: 4, suffix: Infinity }

export interface PathIndex {
  adj: Map<string, string[]>
}

let cache: { dict: Dictionary; index: PathIndex } | null = null

export function pathIndex(dict: Dictionary): PathIndex {
  if (cache?.dict === dict) return cache.index
  const adj = new Map<string, string[]>()
  const add = (a: string, b: string) => {
    if (a === b) return
    const la = adj.get(a) ?? []
    la.push(b)
    adj.set(a, la)
  }
  const usable = (id: string) => {
    const m = dict.morphById.get(id)
    return !!m && m.type !== 'suffix'
  }
  for (const e of dict.entries) {
    for (const mid of e.morphs) {
      if (!usable(mid)) continue
      add('e:' + e.key, 'm:' + mid)
      add('m:' + mid, 'e:' + e.key)
    }
  }
  for (const m of dict.morphemes) {
    if (m.type === 'suffix') continue
    for (const x of [...(m.parts ?? []), ...(m.partOf ?? []), ...(m.family ?? []), ...(m.members ?? [])]) {
      if (!usable(x)) continue
      add('m:' + m.id, 'm:' + x)
      add('m:' + x, 'm:' + m.id)
    }
  }
  const index = { adj }
  cache = { dict, index }
  return index
}

/** 点に入るときの重さ。語根は軽く、接頭辞は重く。単語はよく使う語ほど軽い（道の途中に知っている語が出やすいように） */
function cost(dict: Dictionary, id: string): number {
  if (id.startsWith('m:')) return MORPH_COST[dict.morphById.get(id.slice(2))?.type ?? 'suffix']
  const rank = dict.byKey.get(id.slice(2))?.rank ?? 20000
  return 1 + Math.min(rank, 20000) / 10000
}

/** いちばん軽い道（点の列）。つながらなければ null */
export function findPath(dict: Dictionary, from: string, to: string): string[] | null {
  if (from === to) return [from]
  const { adj } = pathIndex(dict)
  if (!adj.has(from) || !adj.has(to)) return null
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, string>()
  // 点の数が数万なので、単純な二分ヒープで十分
  const heap: [number, string][] = [[0, from]]
  const push = (x: [number, string]) => {
    heap.push(x)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = (): [number, string] => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  while (heap.length) {
    const [d, u] = pop()
    if (u === to) break
    if (d > (dist.get(u) ?? Infinity)) continue
    for (const v of adj.get(u) ?? []) {
      // 途中に見出しから外した語（センシティブな単語など）は通らない
      if (v.startsWith('e:') && !dict.byKey.has(v.slice(2))) continue
      const nd = d + cost(dict, v)
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd)
        prev.set(v, u)
        push([nd, v])
      }
    }
  }
  if (!prev.has(to)) return null
  const path = [to]
  while (path[path.length - 1] !== from) path.push(prev.get(path[path.length - 1])!)
  return path.reverse()
}
