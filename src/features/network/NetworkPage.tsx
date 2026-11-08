import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Compass, ExternalLink, Map as MapIcon, Maximize2, SlidersHorizontal, Target, X } from 'lucide-react'
import { Suspense, use, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Segmented } from '@/components/ui/Form'
import { SearchField } from '@/components/ui/SearchField'
import { PageSpinner } from '@/components/ui/Spinner'
import { getEntry, headword } from '@/features/dictionary/data'
import { useDictionary } from '@/features/dictionary/hooks'
import { searchDictionary, type SearchHit } from '@/features/dictionary/search'
import { morphLabel } from '@/features/dictionary/components/links'
import { cn } from '@/lib/cn'
import { db } from '@/lib/db'
import { usePersistentState } from '@/lib/persist'
import { useResolvedTheme } from '@/lib/theme'
import { buildEntryGraph, buildMorphGraph, buildMorphemeMap, EDGE_LABEL, readPalette, type EdgeKind, type NetGraph, type NodeAttrs } from './graph'
import { FocusPicker, randomFocus } from './FocusPicker'
import { SigmaGraph } from './SigmaGraph'
import type { NetworkSearch } from './search'

const KIND_LABEL: Record<string, string> = {
  word: '単語',
  phrase: '熟語',
  root: '語根',
  prefix: '接頭辞',
  suffix: '接尾辞',
  pie: '印欧祖語',
  particle: '不変化詞',
}

function Legend() {
  const items: [string, string][] = [
    ['var(--node-word)', '単語'],
    ['var(--node-phrase)', '熟語'],
    ['var(--node-root)', '語根'],
    ['var(--node-affix)', '接辞'],
    ['var(--node-pie)', '祖語'],
  ]
  return (
    <div className="flex gap-3 text-[11px] text-muted">
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  )
}

const entryGraphCache = new Map<string, Promise<NetGraph | null>>()

/** 探索モードのグラフ（中心の語・語根ごとにキャッシュ。グラフ表示とつながり一覧で共有する） */
function egoGraphPromise(dict: ReturnType<typeof useDictionary>, theme: string, focus: string) {
  const cacheKey = `${theme}|${focus}`
  let p = entryGraphCache.get(cacheKey)
  if (!p) {
    p = (async () => {
      const pal = readPalette()
      if (focus.startsWith('m:')) return buildMorphGraph(dict, focus.slice(2), pal)
      const entry = await getEntry(focus.slice(2))
      return entry ? buildEntryGraph(dict, entry, pal) : null
    })()
    entryGraphCache.set(cacheKey, p)
    if (entryGraphCache.size > 30) entryGraphCache.delete(entryGraphCache.keys().next().value!)
  }
  return p
}

/** 探索で表示する線の種類（オフにした種類の線と、その線でしかつながっていない点を隠す） */
const EGO_KINDS: EdgeKind[] = ['morph', 'co', 'der', 'syn', 'ant', 'phrase', 'rel']
const KIND_SHORT: Record<EdgeKind, string> = {
  morph: '語源',
  co: '他の語根',
  der: '派生語',
  syn: '類義語',
  ant: '反義語',
  phrase: '熟語',
  rel: '関連語',
}

/** オフにした種類の線と、中心からオンの線だけではたどれない点 */
function egoHidden(graph: NetGraph, focus: string, off: ReadonlySet<EdgeKind>) {
  const edges = new Set<string>()
  graph.forEachEdge((e, a) => {
    if (off.has(a.kind)) edges.add(e)
  })
  const reach = new Set<string>([focus])
  const queue = [focus]
  while (queue.length) {
    const n = queue.shift()!
    graph.forEachEdge(n, (e, _a, s, t) => {
      if (edges.has(e)) return
      const o = s === n ? t : s
      if (!reach.has(o)) {
        reach.add(o)
        queue.push(o)
      }
    })
  }
  const nodes = new Set(graph.nodes().filter((n) => !reach.has(n)))
  return { nodes, edges }
}

function EgoGraph({ focus, off, onSelect }: { focus: string; off: ReadonlySet<EdgeKind>; onSelect: (id: string, a: NodeAttrs) => void }) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const graph = use(egoGraphPromise(dict, theme, focus))
  const hidden = useMemo(() => (graph && graph.hasNode(focus) ? egoHidden(graph, focus, off) : null), [graph, focus, off])
  if (!graph) return null
  return <SigmaGraph graph={graph} onNodeClick={onSelect} labelThreshold={0} hiddenNodes={hidden?.nodes} hiddenEdges={hidden?.edges} />
}

/** 線の種類ごとの表示のオン・オフ（この中心のグラフにある種類だけ出す） */
function KindToggles({ focus, off, onToggle }: { focus: string; off: ReadonlySet<EdgeKind>; onToggle: (k: EdgeKind) => void }) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const graph = use(egoGraphPromise(dict, theme, focus))
  if (!graph) return null
  const present = new Set<EdgeKind>()
  graph.forEachEdge((_e, a) => present.add(a.kind))
  const kinds = EGO_KINDS.filter((k) => present.has(k))
  if (kinds.length < 2) return null
  const nothing = graph.hasNode(focus) && egoHidden(graph, focus, off).nodes.size >= graph.order - 1
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="表示する線の種類">
      <span className="mr-0.5 text-[11px] text-muted">表示：</span>
      {kinds.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={!off.has(k)}
          onClick={() => onToggle(k)}
          className={cn(
            'rounded-full border px-2 py-0.5 text-[11px]',
            off.has(k) ? 'border-border text-muted line-through' : 'border-accent/60 text-accent',
          )}
        >
          {KIND_SHORT[k]}
        </button>
      ))}
      {nothing && <span className="w-full text-[11px] text-muted">表示する種類がオフのため、つながりが見えていません</span>}
    </div>
  )
}

/**
 * 中心の語・語根のつながりを、種類ごとの一覧で示す（U06）。
 * タップできない・ホバーできない環境や、キーボード・読み上げでもネットワークを辿れるようにする
 */
function ConnectionList({ focus, off, onPick }: { focus: string; off: ReadonlySet<EdgeKind>; onPick: (id: string) => void }) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const graph = use(egoGraphPromise(dict, theme, focus))
  if (!graph || !graph.hasNode(focus)) return null
  const groups = new Map<EdgeKind, { id: string; label: string; sub: string }[]>()
  graph.forEachEdge(focus, (_e, attrs, s, t) => {
    if (off.has(attrs.kind)) return
    const other = s === focus ? t : s
    const a = graph.getNodeAttributes(other)
    const list = groups.get(attrs.kind) ?? []
    list.push({ id: other, label: a.label, sub: a.sub })
    groups.set(attrs.kind, list)
  })
  const total = [...groups.values()].reduce((n, l) => n + l.length, 0)
  if (!total) return null
  return (
    <details className="mt-2 border-t border-border pt-2 text-sm">
      <summary className="cursor-pointer select-none text-xs text-muted">つながり一覧（{total}）</summary>
      <div className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto">
        {[...groups].map(([kind, list]) => (
          <section key={kind}>
            <h3 className="mb-1 text-[11px] font-medium text-muted">{EDGE_LABEL[kind]}</h3>
            <ul className="flex flex-wrap gap-1">
              {list.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => onPick(x.id)}
                    className="rounded-full border border-border px-2 py-0.5 text-xs hover:border-accent hover:text-accent"
                    title={x.sub}
                  >
                    <span className="font-en">{x.label}</span>
                    {x.sub && <span className="ml-1 text-muted">{x.sub}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  )
}

// ---------------------------------------------------------------- 語根マップ

type MapKind = 'root' | 'prefix' | 'pie'
type Lang = 'latin' | 'greek' | 'other'
type Mine = 'all' | 'learning' | 'viewed'

interface MapFilter {
  kinds: MapKind[]
  langs: Lang[]
  /** この数より単語の少ない語根を隠す */
  minWords: number
  /** 共通の語がこの数より少ない線を隠す */
  minShared: number
  mine: Mine
}

const DEFAULT_FILTER: MapFilter = { kinds: ['root', 'prefix'], langs: ['latin', 'greek', 'other'], minWords: 2, minShared: 1, mine: 'all' }

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('rounded-full border px-2.5 py-0.5 text-xs', on ? 'border-accent bg-accent text-accent-fg' : 'border-border text-muted hover:border-accent')}
    >
      {children}
    </button>
  )
}

function MapFilterPanel({ filter, setFilter, shown, total }: { filter: MapFilter; setFilter: (f: MapFilter) => void; shown: number; total: number }) {
  const set = (p: Partial<MapFilter>) => setFilter({ ...filter, ...p })
  return (
    <div className="flex flex-col gap-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0 text-muted">種類</span>
        <Chip on={filter.kinds.includes('root')} onClick={() => set({ kinds: toggle(filter.kinds, 'root') })}>語根</Chip>
        <Chip on={filter.kinds.includes('prefix')} onClick={() => set({ kinds: toggle(filter.kinds, 'prefix') })}>接頭辞</Chip>
        <Chip on={filter.kinds.includes('pie')} onClick={() => set({ kinds: toggle(filter.kinds, 'pie') })}>祖語</Chip>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0 text-muted">由来</span>
        <Chip on={filter.langs.includes('latin')} onClick={() => set({ langs: toggle(filter.langs, 'latin') })}>ラテン語</Chip>
        <Chip on={filter.langs.includes('greek')} onClick={() => set({ langs: toggle(filter.langs, 'greek') })}>ギリシャ語</Chip>
        <Chip on={filter.langs.includes('other')} onClick={() => set({ langs: toggle(filter.langs, 'other') })}>その他</Chip>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0 text-muted">自分の</span>
        <Chip on={filter.mine === 'all'} onClick={() => set({ mine: 'all' })}>すべて</Chip>
        <Chip on={filter.mine === 'learning'} onClick={() => set({ mine: 'learning' })}>学習中の語を含む</Chip>
        <Chip on={filter.mine === 'viewed'} onClick={() => set({ mine: 'viewed' })}>見た語を含む</Chip>
      </div>
      <label className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-muted">大きさ</span>
        <input
          type="range"
          min={2}
          max={30}
          value={filter.minWords}
          onChange={(e) => set({ minWords: Number(e.target.value) })}
          className="flex-1 accent-[var(--accent)]"
        />
        <span className="w-20 shrink-0 text-right">{filter.minWords} 語以上</span>
      </label>
      <label className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-muted">線</span>
        <input
          type="range"
          min={1}
          max={6}
          value={filter.minShared}
          onChange={(e) => set({ minShared: Number(e.target.value) })}
          className="flex-1 accent-[var(--accent)]"
        />
        <span className="w-20 shrink-0 text-right">共通 {filter.minShared} 語以上</span>
      </label>
      <div className="flex items-center justify-between text-muted">
        <span>
          {shown} / {total} 個を表示
        </span>
        <button type="button" className="text-accent underline" onClick={() => setFilter(DEFAULT_FILTER)}>
          元に戻す
        </button>
      </div>
    </div>
  )
}

/** 語根マップで選んだ語根の情報（タップで選ぶ → ここから探索・詳細へ） */
function MapSelection({ id, onExplore, onClose }: { id: string; onExplore: () => void; onClose: () => void }) {
  const dict = useDictionary()
  const { t } = useTranslation()
  const m = dict.morphById.get(id.slice(2))
  if (!m) return null
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted">
          {KIND_LABEL[m.type]} ・ {m.origin}
        </div>
        <div className="truncate">
          <span className="font-en text-lg font-semibold">{morphLabel(m)}</span>
          <span className="ml-2 text-sm">{m.meaning.ja}</span>
        </div>
        <div className="truncate text-xs text-muted">
          {t('common.count', { count: m.words.length })}：{m.words.slice(0, 6).map(headword).join(', ')}
          {m.words.length > 6 ? ' …' : ''}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <button type="button" onClick={onExplore} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm text-accent-fg">
          <Compass className="size-4" /> 探索
        </button>
        <Link to="/m/$id" params={{ id: m.id }} className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-border px-3 text-xs">
          <ExternalLink className="size-3.5" /> 詳細
        </Link>
      </div>
      <button type="button" onClick={onClose} className="self-start rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="選ぶのをやめる">
        <X className="size-4" />
      </button>
    </div>
  )
}

function MapView({ onExplore }: { onExplore: (id: string) => void }) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const graph = useMemo(() => buildMorphemeMap(dict, readPalette()), [dict, theme])
  const [filter, setFilter] = usePersistentState<MapFilter>('network:mapFilter', DEFAULT_FILTER)
  const [panelOpen, setPanelOpen] = usePersistentState('network:mapFilterOpen', false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  // 自分の学習: 学習中・見たことのある単語を含む語根
  const mineIds = useLiveQuery(async () => {
    if (filter.mine === 'all') return null
    const keys = filter.mine === 'learning' ? (await db.cards.toArray()).map((c) => c.entryId) : await db.views.orderBy('entryId').uniqueKeys()
    const s = new Set<string>()
    for (const k of keys) for (const m of dict.byKey.get(String(k))?.morphs ?? []) s.add('m:' + m)
    return s
  }, [filter.mine, dict])

  const hiddenNodes = useMemo(() => {
    const h = new Set<string>()
    graph.forEachNode((id, a) => {
      const kindOk = filter.kinds.includes(a.kind as MapKind)
      const langOk = a.kind === 'pie' || filter.langs.includes(a.lang ?? 'other')
      const sizeOk = (a.count ?? 0) >= filter.minWords
      const mineOk = filter.mine === 'all' || !mineIds || mineIds.has(id)
      if (!(kindOk && langOk && sizeOk && mineOk)) h.add(id)
    })
    return h
  }, [graph, filter, mineIds])

  const hiddenEdges = useMemo(() => {
    const h = new Set<string>()
    graph.forEachEdge((e, a) => {
      if (a.weight < filter.minShared) h.add(e)
    })
    return h
  }, [graph, filter.minShared])

  const matched = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return null
    const out = new Set<string>()
    graph.forEachNode((id, a) => {
      if (hiddenNodes.has(id)) return
      if (a.label.toLowerCase().includes(s) || a.sub.includes(s)) out.add(id)
    })
    return out
  }, [graph, q, hiddenNodes])

  const shown = graph.order - hiddenNodes.size
  const selectedVisible = selected && !hiddenNodes.has(selected) ? selected : null

  return (
    <>
      <SigmaGraph
        graph={graph}
        onNodeClick={(id) => setSelected(id)}
        onStageClick={() => setSelected(null)}
        liveLayout
        labelThreshold={7}
        hiddenNodes={hiddenNodes}
        hiddenEdges={hiddenEdges}
        matched={matched}
        selected={selectedVisible}
      />
      <div className="absolute inset-x-3 top-3 flex flex-col gap-2 md:right-auto md:w-96">
        <div className="flex gap-2">
          <div className="flex-1">
            <SearchField value={q} onValueChange={setQ} placeholder="意味で探す（例: 運ぶ・見る）" className="[&_input]:h-9 [&_input]:bg-surface/95" />
          </div>
          <button
            type="button"
            onClick={() => setPanelOpen(!panelOpen)}
            aria-expanded={panelOpen}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm',
              panelOpen ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface/95',
            )}
          >
            <SlidersHorizontal className="size-4" /> 絞り込み
          </button>
        </div>
        {matched && (
          <div className="self-start rounded-lg bg-surface/95 px-2 py-1 text-[11px] text-muted shadow">
            {matched.size ? `「${q.trim()}」に当てはまる ${matched.size} 個` : `「${q.trim()}」に当てはまる語根はありません`}
          </div>
        )}
        {panelOpen && (
          <div className="rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
            <MapFilterPanel filter={filter} setFilter={setFilter} shown={shown} total={graph.order} />
          </div>
        )}
      </div>
      {selectedVisible ? (
        <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur md:inset-x-auto md:right-4 md:w-96">
          <MapSelection id={selectedVisible} onExplore={() => onExplore(selectedVisible)} onClose={() => setSelected(null)} />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] text-muted">
          <Maximize2 className="size-3.5" /> タップで選ぶ・ピンチ・ホイールで拡大
        </div>
      )}
    </>
  )
}

function FocusPanel({ focus }: { focus: string }) {
  const dict = useDictionary()
  const { t } = useTranslation()
  if (focus.startsWith('m:')) {
    const m = dict.morphById.get(focus.slice(2))
    if (!m) return null
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted">{KIND_LABEL[m.type]}</div>
          <div className="truncate">
            <span className="font-en text-lg font-semibold">{morphLabel(m)}</span>
            <span className="ml-2 text-sm">{m.meaning.ja}</span>
          </div>
          <div className="text-xs text-muted">
            {m.origin} ・ {t('common.count', { count: m.words.length })}
          </div>
        </div>
        <Link
          to="/m/$id"
          params={{ id: m.id }}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm text-accent-fg"
        >
          <ExternalLink className="size-4" /> 詳細
        </Link>
      </div>
    )
  }
  const key = focus.slice(2)
  const ie = dict.byKey.get(key)
  if (!ie) return null
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted">{ie.type === 'p' ? '熟語' : '単語'}</div>
        <div className="font-en truncate text-lg font-semibold">{headword(key)}</div>
        <div className="truncate text-sm text-muted">{ie.gloss}</div>
      </div>
      <Link
        to="/e/$key"
        params={{ key }}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm text-accent-fg"
      >
        <ExternalLink className="size-4" /> 詳細
      </Link>
    </div>
  )
}

function FocusSearch({ onPick }: { onPick: (focus: string) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const dict = useDictionary()
  useEffect(() => {
    if (!q.trim()) return setHits([])
    let alive = true
    searchDictionary(q).then(
      (h) => alive && setHits(h.slice(0, 8)),
      () => alive && setHits([]),
    )
    return () => {
      alive = false
    }
  }, [q])
  return (
    <div className="relative">
      <SearchField value={q} onValueChange={setQ} placeholder="単語・語根を探す" className="[&_input]:h-10" />
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {hits.map((h) => {
            const label =
              h.kind === 'morpheme'
                ? (() => {
                    const m = dict.morphById.get(h.key)
                    return m ? `${morphLabel(m)}  ${m.meaning.ja}` : h.key
                  })()
                : `${headword(h.key)}  ${dict.byKey.get(h.key)?.gloss}`
            return (
              <li key={h.kind + h.key}>
                <button
                  type="button"
                  className="w-full truncate px-3 py-2 text-left text-sm hover:bg-surface-2"
                  onClick={() => {
                    onPick((h.kind === 'morpheme' ? 'm:' : 'e:') + h.key)
                    setQ('')
                  }}
                >
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const LAST_FOCUS_KEY = 'nev-network-focus'

function readLastFocus(): string | null {
  try {
    return localStorage.getItem(LAST_FOCUS_KEY)
  } catch {
    return null
  }
}

/** たどった道のり（最近の中心）。タップで戻れる */
function Trail({ trail, focus, onPick }: { trail: string[]; focus: string; onPick: (id: string) => void }) {
  const dict = useDictionary()
  const items = trail
    .map((id) => {
      if (id.startsWith('m:')) {
        const m = dict.morphById.get(id.slice(2))
        return m ? { id, label: morphLabel(m) } : null
      }
      return dict.byKey.get(id.slice(2)) ? { id, label: headword(id.slice(2)) } : null
    })
    .filter((x): x is { id: string; label: string } => !!x)
  if (items.length < 2) return null
  return (
    <nav aria-label="たどった道のり" className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 text-xs md:px-5">
      {items.map((x, i) => (
        <span key={x.id} className="flex shrink-0 items-center gap-1">
          {i > 0 && <span className="text-muted">›</span>}
          <button
            type="button"
            onClick={() => onPick(x.id)}
            aria-current={x.id === focus ? 'true' : undefined}
            className={cn('font-en rounded-full px-2 py-0.5', x.id === focus ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
          >
            {x.label}
          </button>
        </span>
      ))}
    </nav>
  )
}

function NetworkInner() {
  const search = useSearch({ from: '/network' }) as NetworkSearch
  const navigate = useNavigate({ from: '/network' })
  const dict = useDictionary()
  const mode = search.mode ?? 'ego'
  // 中心を指定せずに開いたときは、前回の続きから（初めてならおまかせ）
  const defaultFocus = useMemo(() => {
    const last = readLastFocus()
    const ok = last && (last.startsWith('m:') ? dict.morphById.has(last.slice(2)) : dict.byKey.has(last.slice(2)))
    return ok ? last! : randomFocus(dict)
  }, [dict])
  const focus = search.focus ?? defaultFocus
  const [trail, setTrail] = usePersistentState<string[]>('network:trail', [])
  const [offList, setOffList] = usePersistentState<EdgeKind[]>('network:offKinds', [])
  const off = useMemo(() => new Set(offList), [offList])

  // 中心を覚えて、道のりに足す（道のりにある中心へ戻ったときは、道のりをそのまま残す）
  useEffect(() => {
    try {
      localStorage.setItem(LAST_FOCUS_KEY, focus)
    } catch {
      /* 覚えられなくても表示はできる */
    }
    setTrail((prev) => {
      const i = prev.indexOf(focus)
      if (i >= 0) return prev
      return [...prev, focus].slice(-12)
    })
  }, [focus, setTrail])

  const setFocus = (f: string) => void navigate({ to: '/network', search: { focus: f } })
  const onSelect = (id: string) => {
    if (id === focus && mode === 'ego') {
      if (id.startsWith('e:')) void navigate({ to: '/e/$key', params: { key: id.slice(2) } })
      else void navigate({ to: '/m/$id', params: { id: id.slice(2) } })
      return
    }
    setFocus(id)
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem-3.5rem-env(safe-area-inset-bottom))] flex-col md:h-[calc(100dvh-3.5rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 md:px-5">
        <Segmented<'ego' | 'map'>
          value={mode}
          onChange={(m) => void navigate({ to: '/network', search: { focus: search.focus, mode: m === 'map' ? 'map' : undefined } })}
          options={[
            { value: 'ego', label: '探索' },
            { value: 'map', label: '語根マップ' },
          ]}
        />
        <div className="flex min-w-48 flex-1 gap-2">
          <div className="min-w-0 flex-1">
            <FocusSearch onPick={setFocus} />
          </div>
          <FocusPicker onPick={setFocus} />
        </div>
      </div>
      {mode === 'ego' && <Trail trail={trail} focus={focus} onPick={setFocus} />}
      <div className="relative flex-1 overflow-hidden">
        <Suspense fallback={<PageSpinner />}>
          {mode === 'map' ? <MapView onExplore={setFocus} /> : <EgoGraph focus={focus} off={off} onSelect={onSelect} />}
        </Suspense>
        {mode === 'ego' && (
          <>
            <div className="pointer-events-none absolute left-3 top-3 hidden items-center gap-1.5 text-[11px] text-muted md:flex">
              <Target className="size-3.5" />
              タップで中心を移動・中心をもう一度タップで詳細
            </div>
            <div className="pointer-events-none absolute left-3 top-3 md:left-auto md:right-3">
              <Legend />
            </div>
            <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur md:inset-x-auto md:right-4 md:w-96">
              <FocusPanel focus={focus} />
              <Suspense fallback={null}>
                <KindToggles focus={focus} off={off} onToggle={(k) => setOffList(off.has(k) ? offList.filter((x) => x !== k) : [...offList, k])} />
                <ConnectionList focus={focus} off={off} onPick={setFocus} />
              </Suspense>
            </div>
          </>
        )}
        {mode === 'map' && (
          <div className="pointer-events-none absolute right-3 top-14 hidden md:block">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <MapIcon className="size-3.5" /> 語根を選んで「探索」でつながりへ
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function NetworkPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NetworkInner />
    </Suspense>
  )
}
