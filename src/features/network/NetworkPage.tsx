import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeftRight, ChevronDown, Compass, Dices, ExternalLink, Maximize2, SlidersHorizontal, Target, X } from 'lucide-react'
import { Suspense, use, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
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
import { buildEntryGraph, buildMorphGraph, buildMorphemeMap, buildPathGraph, DENSITY_SCALE, EDGE_LABEL, readPalette, type Density, type EdgeKind, type NetGraph, type NodeAttrs } from './graph'
import { findPath } from './path'
import { markVisited, useVisitedMorphs } from './visited'
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
function egoGraphPromise(dict: ReturnType<typeof useDictionary>, theme: string, focus: string, density: Density) {
  const cacheKey = `${theme}|${density}|${focus}`
  let p = entryGraphCache.get(cacheKey)
  if (!p) {
    p = (async () => {
      const pal = readPalette()
      const scale = DENSITY_SCALE[density]
      if (focus.startsWith('m:')) return buildMorphGraph(dict, focus.slice(2), pal, scale)
      const entry = await getEntry(focus.slice(2))
      return entry ? buildEntryGraph(dict, entry, pal, scale) : null
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

function EgoGraph({
  focus,
  off,
  density,
  onSelect,
}: {
  focus: string
  off: ReadonlySet<EdgeKind>
  density: Density
  onSelect: (id: string, a: NodeAttrs) => void
}) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const graph = use(egoGraphPromise(dict, theme, focus, density))
  const hidden = useMemo(() => (graph && graph.hasNode(focus) ? egoHidden(graph, focus, off) : null), [graph, focus, off])
  if (!graph) return null
  return <SigmaGraph graph={graph} onNodeClick={onSelect} labelThreshold={0} hiddenNodes={hidden?.nodes} hiddenEdges={hidden?.edges} />
}

/** 線の種類ごとの表示のオン・オフ（この中心のグラフにある種類だけ出す） */
function KindToggles({ focus, off, density, onToggle }: { focus: string; off: ReadonlySet<EdgeKind>; density: Density; onToggle: (k: EdgeKind) => void }) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const graph = use(egoGraphPromise(dict, theme, focus, density))
  if (!graph) return null
  const present = new Set<EdgeKind>()
  graph.forEachEdge((_e, a) => present.add(a.kind))
  const kinds = EGO_KINDS.filter((k) => present.has(k))
  if (kinds.length < 2) return null
  const nothing = graph.hasNode(focus) && egoHidden(graph, focus, off).nodes.size >= graph.order - 1
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="表示する線の種類">
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
function ConnectionList({ focus, off, density, onPick }: { focus: string; off: ReadonlySet<EdgeKind>; density: Density; onPick: (id: string) => void }) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const graph = use(egoGraphPromise(dict, theme, focus, density))
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
    <details className="border-t border-border pt-2 text-sm">
      <summary className="cursor-pointer select-none text-xs text-muted">つながり一覧（{total}）</summary>
      <div className="mt-2 flex max-h-40 flex-col gap-2 overflow-y-auto md:max-h-56">
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
  /** 語根めぐり: 訪れた語根だけに色を付ける */
  visited: boolean
}

const DEFAULT_FILTER: MapFilter = { kinds: ['root', 'prefix'], langs: ['latin', 'greek', 'other'], minWords: 2, minShared: 1, mine: 'all', visited: false }

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

function MapFilterPanel({
  filter,
  setFilter,
  shown,
  total,
  visitedCount,
  rootTotal,
}: {
  filter: MapFilter
  setFilter: (f: MapFilter) => void
  shown: number
  total: number
  visitedCount: number
  rootTotal: number
}) {
  const set = (p: Partial<MapFilter>) => setFilter({ ...filter, ...p })
  return (
    <div className="flex flex-col gap-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0 text-muted">めぐり</span>
        <Chip on={filter.visited} onClick={() => set({ visited: !filter.visited })}>
          訪れた所に色
        </Chip>
        <span className="text-muted">
          訪れた語根 {visitedCount} / {rootTotal}
        </span>
      </div>
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
        <button type="button" className="text-accent underline" onClick={() => setFilter({ ...DEFAULT_FILTER, visited: filter.visited })}>
          元に戻す
        </button>
      </div>
    </div>
  )
}

/**
 * つながりページの枠: 上に道具の行、真ん中に図、下にパネル。
 * スマホではパネルを図の下に置いて図と重ねない（折りたためる）。広い画面では図の右下に浮かべる
 */
function Frame({ toolbar, below, overlay, panel, children }: { toolbar: ReactNode; below?: ReactNode; overlay?: ReactNode; panel?: ReactNode; children: ReactNode }) {
  return (
    <div data-screenshot-keep className="flex h-[calc(100dvh-3.5rem-3.5rem-env(safe-area-inset-bottom))] flex-col md:h-[calc(100dvh-3.5rem)]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:px-5">{toolbar}</div>
      {below}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<PageSpinner />}>{children}</Suspense>
          {overlay}
        </div>
        {panel && (
          <div className="shrink-0 border-t border-border bg-surface px-3 py-2 md:absolute md:bottom-4 md:right-4 md:w-96 md:rounded-2xl md:border md:bg-surface/95 md:p-3 md:shadow-lg md:backdrop-blur">
            {panel}
          </div>
        )}
      </div>
    </div>
  )
}

/** 折りたためるパネル: いつも見える 1 行（summary）と、開いたときだけの中身。開け閉めは覚えておく */
function Collapsible({ storageKey, summary, children }: { storageKey: string; summary: ReactNode; children?: ReactNode }) {
  const [open, setOpen] = usePersistentState(storageKey, true)
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{summary}</div>
        {children && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? 'パネルをたたむ' : 'パネルを開く'}
            title={open ? 'たたむ' : '開く'}
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <ChevronDown className={cn('size-5 transition-transform', open ? '' : 'rotate-180')} />
          </button>
        )}
      </div>
      {children && open && <div className="mt-2 flex flex-col gap-2">{children}</div>}
    </div>
  )
}

type NetworkMode = 'ego' | 'map' | 'path'

/** 表示の切り替え（探索・語根マップ・道をつなぐ）。スマホでは短い名前 */
function ModeSwitch({ mode, onChange }: { mode: NetworkMode; onChange: (m: NetworkMode) => void }) {
  const both = (short: string, long: string) => (
    <>
      <span className="md:hidden">{short}</span>
      <span className="hidden md:inline">{long}</span>
    </>
  )
  return (
    <div className="shrink-0 [&_button]:px-2.5 md:[&_button]:px-3">
      <Segmented<NetworkMode>
        value={mode}
        onChange={onChange}
        options={[
          { value: 'ego', label: '探索' },
          { value: 'map', label: both('マップ', '語根マップ') },
          { value: 'path', label: both('道', '道をつなぐ') },
        ]}
      />
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
        <button type="button" onClick={onExplore} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm text-accent-fg">
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

function MapView({ modeSwitch, onExplore }: { modeSwitch: ReactNode; onExplore: (id: string) => void }) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const graph = useMemo(() => buildMorphemeMap(dict, readPalette()), [dict, theme])
  const [stored, setFilter] = usePersistentState<MapFilter>('network:mapFilter', DEFAULT_FILTER)
  // 前の版で保存した絞り込みに、新しい項目の既定を足す
  const filter = useMemo(() => ({ ...DEFAULT_FILTER, ...stored }), [stored])
  const visited = useVisitedMorphs()
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

  // 語根めぐり: 訪れていない語根を薄く
  const dimmed = useMemo(() => {
    if (!filter.visited) return null
    const s = new Set<string>()
    graph.forEachNode((id) => {
      if (!visited.has(id.slice(2))) s.add(id)
    })
    return s
  }, [graph, filter.visited, visited])
  const visitedCount = useMemo(() => dict.morphemes.filter((m) => m.type === 'root' && visited.has(m.id)).length, [dict, visited])
  const rootTotal = useMemo(() => dict.morphemes.filter((m) => m.type === 'root').length, [dict])

  const shown = graph.order - hiddenNodes.size
  const selectedVisible = selected && !hiddenNodes.has(selected) ? selected : null

  return (
    <Frame
      toolbar={
        <>
          {modeSwitch}
          <div className="min-w-0 flex-1">
            <SearchField value={q} onValueChange={setQ} placeholder="検索" className="[&_input]:h-9" />
          </div>
          <button
            type="button"
            onClick={() => setPanelOpen(!panelOpen)}
            aria-expanded={panelOpen}
            aria-label="絞り込み"
            title="絞り込み"
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-sm',
              panelOpen ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface',
            )}
          >
            <SlidersHorizontal className="size-4" />
            <span className="hidden sm:inline">絞り込み</span>
          </button>
        </>
      }
      below={
        panelOpen && (
          <div className="max-h-[45dvh] shrink-0 overflow-y-auto border-b border-border bg-surface px-3 py-2.5 md:px-5">
            <div className="md:max-w-xl">
              <MapFilterPanel filter={filter} setFilter={setFilter} shown={shown} total={graph.order} visitedCount={visitedCount} rootTotal={rootTotal} />
            </div>
          </div>
        )
      }
      overlay={
        <>
          {matched && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-surface/95 px-2 py-1 text-[11px] text-muted shadow">
              {matched.size ? `「${q.trim()}」に当てはまる ${matched.size} 個` : `「${q.trim()}」に当てはまる語根はありません`}
            </div>
          )}
          {!selectedVisible && (
            <div className="pointer-events-none absolute bottom-2 left-3 flex items-center gap-1.5 rounded-md bg-bg/70 px-1.5 py-0.5 text-[11px] text-muted">
              <Maximize2 className="size-3.5" /> 語根をタップで選ぶ・ピンチで拡大
            </div>
          )}
        </>
      }
      panel={selectedVisible && <MapSelection id={selectedVisible} onExplore={() => onExplore(selectedVisible)} onClose={() => setSelected(null)} />}
    >
      <SigmaGraph
        graph={graph}
        onNodeClick={(id) => setSelected(id)}
        onStageClick={() => setSelected(null)}
        intro={false}
        labelThreshold={7}
        hiddenNodes={hiddenNodes}
        hiddenEdges={hiddenEdges}
        matched={matched}
        selected={selectedVisible}
        dimmed={dimmed}
      />
    </Frame>
  )
}

/** 中心の語・語根を 1 行で（種類・見出し・意味・詳細へ） */
function FocusPanel({ focus }: { focus: string }) {
  const dict = useDictionary()
  const { t } = useTranslation()
  const linkClass = 'inline-flex h-8 shrink-0 items-center gap-1 rounded-xl bg-accent px-2.5 text-sm text-accent-fg'
  let kind: string, title: string, sub: string, link: ReactNode
  if (focus.startsWith('m:')) {
    const m = dict.morphById.get(focus.slice(2))
    if (!m) return null
    kind = `${KIND_LABEL[m.type]} ・ ${m.origin} ・ ${t('common.count', { count: m.words.length })}`
    title = morphLabel(m)
    sub = m.meaning.ja
    link = (
      <Link to="/m/$id" params={{ id: m.id }} className={linkClass}>
        <ExternalLink className="size-3.5" /> 詳細
      </Link>
    )
  } else {
    const key = focus.slice(2)
    const ie = dict.byKey.get(key)
    if (!ie) return null
    kind = ie.type === 'p' ? '熟語' : '単語'
    title = headword(key)
    sub = ie.gloss
    link = (
      <Link to="/e/$key" params={{ key }} className={linkClass}>
        <ExternalLink className="size-3.5" /> 詳細
      </Link>
    )
  }
  return (
    <div className="flex items-center gap-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] leading-tight text-muted">{kind}</div>
        <div className="truncate leading-snug">
          <span className="font-en text-base font-semibold md:text-lg">{title}</span>
          <span className="ml-2 text-sm text-muted">{sub}</span>
        </div>
      </div>
      {link}
    </div>
  )
}

function FocusSearch({ onPick, placeholder = '単語・語根を探す' }: { onPick: (focus: string) => void; placeholder?: string }) {
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
      <SearchField value={q} onValueChange={setQ} placeholder={placeholder} className="[&_input]:h-9" />
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-10 z-30 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
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

function useNodeLabel() {
  const dict = useDictionary()
  return (id: string): string | null => {
    if (id.startsWith('m:')) {
      const m = dict.morphById.get(id.slice(2))
      return m ? morphLabel(m) : null
    }
    return dict.byKey.get(id.slice(2)) ? headword(id.slice(2)) : null
  }
}

/** 道のりに並べる数。これより多いときは前を「…」にまとめ、タップで全部を折り返して見せる */
const TRAIL_SHOWN = 4

/** たどった道のり（最近の中心）。タップで戻れる */
function Trail({ trail, focus, onPick, onClear }: { trail: string[]; focus: string; onPick: (id: string) => void; onClear: () => void }) {
  const label = useNodeLabel()
  const [open, setOpen] = useState(false)
  const items = trail.map((id) => ({ id, label: label(id) })).filter((x): x is { id: string; label: string } => !!x.label)
  if (items.length < 2) return null
  const hiddenCount = open ? 0 : Math.max(0, items.length - TRAIL_SHOWN)
  const shown = items.slice(hiddenCount)
  const chip = (x: { id: string; label: string }) => (
    <button
      type="button"
      onClick={() => onPick(x.id)}
      aria-current={x.id === focus ? 'true' : undefined}
      className={cn('font-en max-w-40 truncate rounded-full px-2 py-0.5', x.id === focus ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
    >
      {x.label}
    </button>
  )
  return (
    <nav
      aria-label="たどった道のり"
      className={cn(
        'absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-2xl border border-border bg-surface/90 px-1.5 py-1 text-xs shadow-sm backdrop-blur md:max-w-[60%]',
        open ? 'flex-wrap' : 'overflow-hidden',
      )}
    >
      {hiddenCount > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full border border-border px-2 py-0.5 text-muted hover:border-accent" aria-label={`前の ${hiddenCount} 件も表示`}>
          … {hiddenCount}
        </button>
      )}
      {shown.map((x, i) => (
        <span key={x.id} className="flex min-w-0 shrink items-center gap-1">
          {(i > 0 || hiddenCount > 0) && <span className="text-muted">›</span>}
          {chip(x)}
        </span>
      ))}
      {open && (
        <span className="ml-auto flex shrink-0 gap-2">
          <button type="button" onClick={() => setOpen(false)} className="text-muted underline">
            たたむ
          </button>
          <button
            type="button"
            onClick={() => {
              onClear()
              setOpen(false)
            }}
            className="text-muted underline"
          >
            消す
          </button>
        </span>
      )}
    </nav>
  )
}

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'few', label: 'すっきり' },
  { value: 'normal', label: 'ふつう' },
  { value: 'many', label: 'たくさん' },
]

/** 表示する単語の数 */
function DensityPicker({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="表示する数">
      {DENSITY_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-full px-2 py-0.5 text-[11px]', value === o.value ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- 道をつなぐ

/** よく使う語から、語源でつながる 2 語をおまかせで選ぶ */
function randomPair(dict: ReturnType<typeof useDictionary>): [string, string] {
  const ws = dict.entries.filter((e) => e.type === 'w' && e.rank <= 4000 && e.morphs.some((m) => dict.morphById.get(m)?.type === 'root'))
  const a = ws[Math.floor(Math.random() * ws.length)]
  let b = ws[Math.floor(Math.random() * ws.length)]
  for (let i = 0; i < 20 && b.morphs.some((m) => a.morphs.includes(m)); i++) b = ws[Math.floor(Math.random() * ws.length)]
  return ['e:' + a.key, 'e:' + b.key]
}

function PathEnd({ id, placeholder, onPick, onClear }: { id: string | null; placeholder: string; onPick: (id: string) => void; onClear: () => void }) {
  const label = useNodeLabel()
  const dict = useDictionary()
  if (!id) return <FocusSearch onPick={onPick} placeholder={placeholder} />
  const sub = id.startsWith('m:') ? dict.morphById.get(id.slice(2))?.meaning.ja : dict.byKey.get(id.slice(2))?.gloss
  return (
    <div className="flex h-9 items-center gap-2 rounded-xl border border-border bg-surface px-3">
      <span className="font-en shrink-0 font-medium">{label(id)}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{sub}</span>
      <button type="button" onClick={onClear} className="rounded p-0.5 text-muted hover:bg-surface-2" aria-label="選び直す">
        <X className="size-4" />
      </button>
    </div>
  )
}

/** 道の説明: 「transport —(port: 運ぶ)— portable」のように、語根を挟んで並べる */
function PathSteps({ path, onPick }: { path: string[]; onPick: (id: string) => void }) {
  const dict = useDictionary()
  const label = useNodeLabel()
  return (
    <ol className="flex flex-wrap items-center gap-1 text-sm">
      {path.map((id, i) => {
        const m = id.startsWith('m:') ? dict.morphById.get(id.slice(2)) : null
        return (
          <li key={id} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted">→</span>}
            <button
              type="button"
              onClick={() => onPick(id)}
              className={cn('rounded-full border px-2 py-0.5', m ? 'border-[var(--node-root)]/50' : 'border-border', 'hover:border-accent')}
              title="ここを中心に探索"
            >
              <span className="font-en">{label(id)}</span>
              {m && <span className="ml-1 text-xs text-muted">{m.meaning.ja}</span>}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

const narrowQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null

/** スマホ幅かどうか */
function useNarrow() {
  return useSyncExternalStore(
    (l) => {
      narrowQuery?.addEventListener('change', l)
      return () => narrowQuery?.removeEventListener('change', l)
    },
    () => !!narrowQuery?.matches,
  )
}

function PathView({ modeSwitch, onExplore }: { modeSwitch: ReactNode; onExplore: (id: string) => void }) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const [ends, setEnds] = usePersistentState<[string | null, string | null]>('network:pathEnds', [null, null])
  const [from, to] = ends
  const path = useMemo(() => (from && to ? findPath(dict, from, to) : null), [dict, from, to])
  const narrow = useNarrow()
  const graph = useMemo(() => (path ? buildPathGraph(dict, path, readPalette(), narrow) : null), [dict, path, theme, narrow])
  const iconBtn = 'inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface disabled:opacity-50'
  return (
    <Frame
      toolbar={
        <>
          {modeSwitch}
          <div className="flex-1" />
          <button type="button" onClick={() => setEnds(randomPair(dict))} className={cn(iconBtn, 'w-auto gap-1.5 px-2.5 text-sm')} title="おまかせの 2 語">
            <Dices className="size-4" /> おまかせ
          </button>
        </>
      }
      below={
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2 md:px-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row">
            <div className="min-w-0 flex-1">
              <PathEnd id={from} placeholder="はじめの単語・語根" onPick={(id) => setEnds([id, to])} onClear={() => setEnds([null, to])} />
            </div>
            <div className="min-w-0 flex-1">
              <PathEnd id={to} placeholder="つなげたい単語・語根" onPick={(id) => setEnds([from, id])} onClear={() => setEnds([from, null])} />
            </div>
          </div>
          <button type="button" onClick={() => setEnds([to, from])} disabled={!from && !to} className={iconBtn} aria-label="入れ替え" title="入れ替え">
            <ArrowLeftRight className="size-4 rotate-90 md:rotate-0" />
          </button>
        </div>
      }
      panel={
        !from || !to ? (
          <p className="text-sm text-muted">2 つの単語（または語根）を選ぶと、語源のつながりをたどって道を探します。例：transport と portable</p>
        ) : path ? (
          <Collapsible
            storageKey="network:pathPanelOpen"
            summary={<div className="text-xs text-muted">{path.length <= 1 ? '同じ語です' : `${Math.floor(path.length / 2)} 歩でつながりました（語をタップで探索）`}</div>}
          >
            <div className="max-h-32 overflow-y-auto md:max-h-none">
              <PathSteps path={path} onPick={onExplore} />
            </div>
          </Collapsible>
        ) : (
          <p className="text-sm text-muted">語源のつながりでは、この 2 つをつなぐ道が見つかりませんでした。別の語で試してみてください。</p>
        )
      }
    >
      {graph && <SigmaGraph graph={graph} onNodeClick={(id) => onExplore(id)} labelThreshold={0} allLabels fitRatio={narrow ? 1.15 : 1.6} />}
    </Frame>
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
  const [density, setDensity] = usePersistentState<Density>('network:density', 'normal')

  // 中心を覚えて、道のりに足す（道のりにある中心へ戻ったときは、道のりをそのまま残す）。語根なら「語根めぐり」に記録
  useEffect(() => {
    if (mode !== 'ego') return
    try {
      localStorage.setItem(LAST_FOCUS_KEY, focus)
    } catch {
      /* 覚えられなくても表示はできる */
    }
    if (focus.startsWith('m:')) markVisited(focus.slice(2))
    setTrail((prev) => (prev.includes(focus) ? prev : [...prev, focus].slice(-30)))
  }, [focus, mode, setTrail])

  const setFocus = (f: string) => void navigate({ to: '/network', search: { focus: f } })
  const onSelect = (id: string) => {
    if (id === focus && mode === 'ego') {
      if (id.startsWith('e:')) void navigate({ to: '/e/$key', params: { key: id.slice(2) } })
      else void navigate({ to: '/m/$id', params: { id: id.slice(2) } })
      return
    }
    setFocus(id)
  }

  const modeSwitch = <ModeSwitch mode={mode} onChange={(m) => void navigate({ to: '/network', search: { focus: search.focus, mode: m === 'ego' ? undefined : m } })} />
  if (mode === 'map') return <MapView modeSwitch={modeSwitch} onExplore={setFocus} />
  if (mode === 'path') return <PathView modeSwitch={modeSwitch} onExplore={setFocus} />

  return (
    <Frame
      toolbar={
        <>
          {modeSwitch}
          <div className="min-w-0 flex-1">
            <FocusSearch onPick={setFocus} placeholder="検索" />
          </div>
          <FocusPicker onPick={setFocus} />
        </>
      }
      overlay={
        <>
          <Trail trail={trail} focus={focus} onPick={setFocus} onClear={() => setTrail([focus])} />
          <div className="pointer-events-none absolute right-3 top-3 hidden md:block">
            <Legend />
          </div>
          <div className="pointer-events-none absolute bottom-2 left-3 flex items-center gap-1.5 rounded-md bg-bg/70 px-1.5 py-0.5 text-[11px] text-muted">
            <Target className="size-3.5" />
            タップで中心を移動・中心をもう一度で詳細
          </div>
        </>
      }
      panel={
        <Collapsible storageKey="network:egoPanelOpen" summary={<FocusPanel focus={focus} />}>
          <Suspense fallback={null}>
            <KindToggles
              focus={focus}
              off={off}
              density={density}
              onToggle={(k) => setOffList(off.has(k) ? offList.filter((x) => x !== k) : [...offList, k])}
            />
            <DensityPicker value={density} onChange={setDensity} />
            <ConnectionList focus={focus} off={off} density={density} onPick={setFocus} />
          </Suspense>
        </Collapsible>
      }
    >
      <EgoGraph focus={focus} off={off} density={density} onSelect={onSelect} />
    </Frame>
  )
}

export function NetworkPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NetworkInner />
    </Suspense>
  )
}
