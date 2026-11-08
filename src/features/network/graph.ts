import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { headword, type Dictionary } from '@/features/dictionary/data'
import { morphLabel } from '@/features/dictionary/components/links'
import type { Entry } from '@/features/dictionary/types'

/**
 * 語源・意味ネットワークのグラフ構築。
 * ノードID: "e:<key>"（単語・熟語） / "m:<id>"（語根・接辞）
 */

export type NodeKind = 'word' | 'phrase' | 'root' | 'prefix' | 'suffix' | 'pie' | 'particle'
export type EdgeKind = 'morph' | 'syn' | 'ant' | 'der' | 'phrase' | 'rel' | 'co'

export interface NodeAttrs {
  label: string
  sub: string
  kind: NodeKind
  ref: string
  x: number
  y: number
  size: number
  color: string
  focus?: boolean
  /** 語根マップ用: 由来の言語（ラテン語 / ギリシャ語 / その他） */
  lang?: 'latin' | 'greek' | 'other'
  /** 語根マップ用: 含む単語の数 */
  count?: number
}
/** 線（つながり）の種類の名前。ホバー時のラベルと、つながり一覧の見出しに使う（ROADMAP U06） */
export const EDGE_LABEL: Record<EdgeKind, string> = {
  morph: '語源（語根・接辞）',
  syn: '類義語',
  ant: '反義語',
  der: '派生語・もとの語',
  phrase: '熟語・構成語',
  rel: '関連語',
  co: '同じ語に含まれる語根',
}

export interface EdgeAttrs {
  kind: EdgeKind
  label?: string
  weight: number
  size: number
  color: string
}

export type NetGraph = Graph<NodeAttrs, EdgeAttrs>

export interface Palette {
  word: string
  phrase: string
  root: string
  prefix: string
  suffix: string
  pie: string
  particle: string
  edge: string
  edgeStrong: string
}

export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return {
    word: v('--node-word'),
    phrase: v('--node-phrase'),
    root: v('--node-root'),
    prefix: v('--node-affix'),
    suffix: v('--node-affix'),
    pie: v('--node-pie'),
    particle: v('--node-phrase'),
    edge: v('--edge'),
    edgeStrong: v('--edge-strong'),
  }
}

const nodeId = {
  entry: (k: string) => `e:${k}`,
  morph: (id: string) => `m:${id}`,
}
export { nodeId }

function addEntryNode(g: NetGraph, dict: Dictionary, key: string, pal: Palette, size: number) {
  const id = nodeId.entry(key)
  if (g.hasNode(id)) return id
  const ie = dict.byKey.get(key)
  if (!ie) return null
  const kind: NodeKind = ie.type === 'p' ? 'phrase' : 'word'
  g.addNode(id, {
    label: headword(key),
    sub: ie.gloss.split('、')[0] ?? '',
    kind,
    ref: key,
    x: Math.random(),
    y: Math.random(),
    size,
    color: pal[kind],
  })
  return id
}

function addMorphNode(g: NetGraph, dict: Dictionary, mid: string, pal: Palette, size: number) {
  const id = nodeId.morph(mid)
  if (g.hasNode(id)) return id
  const m = dict.morphById.get(mid)
  if (!m) return null
  g.addNode(id, {
    label: morphLabel(m),
    sub: m.meaning.ja,
    kind: m.type,
    ref: mid,
    x: Math.random(),
    y: Math.random(),
    size,
    color: pal[m.type],
  })
  return id
}

function link(g: NetGraph, a: string | null, b: string | null, kind: EdgeKind, pal: Palette, weight = 1) {
  if (!a || !b || a === b || g.hasEdge(a, b) || g.hasEdge(b, a)) return
  g.addEdge(a, b, {
    kind,
    label: EDGE_LABEL[kind],
    weight,
    size: kind === 'morph' ? 1.6 : 1,
    color: kind === 'morph' ? pal.edgeStrong : pal.edge,
  })
}

/** 単語を中心にした近傍グラフ */
export function buildEntryGraph(dict: Dictionary, entry: Entry, pal: Palette, perMorph = 10): NetGraph {
  const g: NetGraph = new Graph({ type: 'undirected' })
  const center = addEntryNode(g, dict, entry.k, pal, 18)!
  g.mergeNodeAttributes(center, { focus: true })
  const ie = dict.byKey.get(entry.k)
  const morphs = ie?.morphs ?? []
  for (const mid of morphs) {
    const m = dict.morphById.get(mid)
    if (!m) continue
    // 接尾辞は語数が多くノイズになりやすいので少なめに
    const n = m.type === 'suffix' ? 4 : m.type === 'prefix' || m.type === 'pie' || m.type === 'particle' ? 6 : perMorph
    const mn = addMorphNode(g, dict, mid, pal, 12)
    link(g, center, mn, 'morph', pal, 3)
    for (const w of m.words.filter((x) => x !== entry.k).slice(0, n)) {
      link(g, mn, addEntryNode(g, dict, w, pal, 7), 'morph', pal, 2)
    }
  }
  for (const p of entry.parts ?? []) {
    if (p.m?.startsWith('w:')) link(g, center, addEntryNode(g, dict, p.m.slice(2).replace(/ /g, '_'), pal, 10), 'der', pal, 2)
  }
  const rel: [string[] | undefined, EdgeKind, number][] = [
    [entry.der, 'der', 8],
    [entry.syn, 'syn', 8],
    [entry.ant, 'ant', 5],
    [entry.ph, 'phrase', 8],
    [entry.comp, 'phrase', 6],
    [entry.rel, 'rel', 5],
  ]
  for (const [keys, kind, n] of rel) {
    for (const k of (keys ?? []).slice(0, n)) link(g, center, addEntryNode(g, dict, k, pal, 8), kind, pal, 1)
  }
  layout(g)
  return g
}

/** 語根・接辞を中心にした近傍グラフ */
export function buildMorphGraph(dict: Dictionary, mid: string, pal: Palette, limit = 40): NetGraph {
  const g: NetGraph = new Graph({ type: 'undirected' })
  const center = addMorphNode(g, dict, mid, pal, 18)
  if (!center) return g
  g.mergeNodeAttributes(center, { focus: true })
  const m = dict.morphById.get(mid)!
  const words = m.words.slice(0, limit)
  for (const w of words) {
    const wn = addEntryNode(g, dict, w, pal, 8)
    link(g, center, wn, 'morph', pal, 2)
    // 他の語根（接尾辞以外）とのつながりも表示 → 別のグループへ辿るきっかけ
    for (const other of dict.byKey.get(w)?.morphs ?? []) {
      if (other === mid) continue
      const om = dict.morphById.get(other)
      if (!om || om.type === 'suffix') continue
      link(g, wn, addMorphNode(g, dict, other, pal, 10), 'co', pal, 1)
    }
  }
  // 語源の語源: 成り立ち・それを含む語源・祖語ファミリー・祖語から生まれた語根
  for (const rel of [m.parts, m.partOf, m.family, m.members]) {
    for (const x of rel ?? []) link(g, center, addMorphNode(g, dict, x, pal, 13), 'morph', pal, 3)
  }
  layout(g)
  return g
}

/** 由来の言語（語根マップの絞り込み用） */
export function langOf(origin: string): 'latin' | 'greek' | 'other' {
  if (origin.startsWith('ラテン語')) return 'latin'
  if (origin.startsWith('ギリシャ語')) return 'greek'
  return 'other'
}

/** 全体図: 語根・接頭辞・祖語を、共有する単語数で結んだマップ（どれを見せるかは表示側で絞り込む） */
export function buildMorphemeMap(dict: Dictionary, pal: Palette, minShared = 1): NetGraph {
  const g: NetGraph = new Graph({ type: 'undirected' })
  const ms = dict.morphemes.filter((m) => (m.type === 'root' || m.type === 'prefix' || m.type === 'pie') && m.words.length >= 2)
  const allowed = new Set(ms.map((m) => m.id))
  ms.forEach((m, i) => {
    const a = (i / ms.length) * Math.PI * 2
    g.addNode(nodeId.morph(m.id), {
      label: morphLabel(m),
      sub: m.meaning.ja,
      kind: m.type,
      ref: m.id,
      x: Math.cos(a) * 100,
      y: Math.sin(a) * 100,
      size: 2 + Math.sqrt(m.words.length) * 1.1,
      color: pal[m.type],
      lang: langOf(m.origin),
      count: m.words.length,
    })
  })
  const pairCount = new Map<string, number>()
  for (const e of dict.entries) {
    const ids = e.morphs.filter((x) => allowed.has(x))
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const k = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`
        pairCount.set(k, (pairCount.get(k) ?? 0) + 1)
      }
  }
  for (const [k, c] of pairCount) {
    if (c < minShared) continue
    const [a, b] = k.split('|')
    g.addEdge(nodeId.morph(a), nodeId.morph(b), { kind: 'co', label: `共通の語 ${c}`, weight: c, size: Math.min(3, 0.4 + c / 4), color: pal.edge })
  }
  g.forEachNode((id) => {
    if (g.degree(id) === 0) g.dropNode(id)
  })
  // 初期レイアウトはここで同期計算し、表示後に Web Worker で微調整する
  forceAtlas2.assign(g, {
    iterations: 400,
    settings: { ...forceAtlas2.inferSettings(g), scalingRatio: 30, gravity: 0.5, barnesHutOptimize: true, linLogMode: true },
  })
  return g
}

function layout(g: NetGraph) {
  // 中心ノードを原点に固定し、同心円状に初期配置してから ForceAtlas2 で整える
  let i = 0
  const n = g.order
  g.forEachNode((id, a) => {
    if (a.focus) {
      g.mergeNodeAttributes(id, { x: 0, y: 0 })
      return
    }
    const ring = a.kind === 'word' || a.kind === 'phrase' ? 2 : 1
    const ang = (i++ / n) * Math.PI * 2
    g.mergeNodeAttributes(id, { x: Math.cos(ang) * ring * 10, y: Math.sin(ang) * ring * 10 })
  })
  forceAtlas2.assign(g, {
    iterations: 150,
    settings: { gravity: 1, scalingRatio: 8, strongGravityMode: true, barnesHutOptimize: g.order > 300, adjustSizes: true },
  })
}
