import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ExternalLink, Map as MapIcon, Maximize2, Target } from 'lucide-react'
import { Suspense, use, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Segmented } from '@/components/ui/Form'
import { SearchField } from '@/components/ui/SearchField'
import { PageSpinner } from '@/components/ui/Spinner'
import { getEntry, headword } from '@/features/dictionary/data'
import { useDictionary } from '@/features/dictionary/hooks'
import { searchDictionary, type SearchHit } from '@/features/dictionary/search'
import { morphLabel } from '@/features/dictionary/components/links'
import { useResolvedTheme } from '@/lib/theme'
import { buildEntryGraph, buildMorphGraph, buildMorphemeMap, EDGE_LABEL, readPalette, type EdgeKind, type NetGraph, type NodeAttrs } from './graph'
import { SigmaGraph } from './SigmaGraph'
import type { NetworkSearch } from './search'
import { useGlossText } from '@/features/dictionary/localGloss'

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

function EgoGraph({ focus, onSelect }: { focus: string; onSelect: (id: string, a: NodeAttrs) => void }) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const graph = use(egoGraphPromise(dict, theme, focus))
  if (!graph) return null
  return <SigmaGraph graph={graph} onNodeClick={onSelect} labelThreshold={0} />
}

/**
 * 中心の語・語根のつながりを、種類ごとの一覧で示す（U06）。
 * タップできない・ホバーできない環境や、キーボード・読み上げでもネットワークを辿れるようにする
 */
function ConnectionList({ focus, onPick }: { focus: string; onPick: (id: string) => void }) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const graph = use(egoGraphPromise(dict, theme, focus))
  if (!graph || !graph.hasNode(focus)) return null
  const groups = new Map<EdgeKind, { id: string; label: string; sub: string }[]>()
  graph.forEachEdge(focus, (_e, attrs, s, t) => {
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

function MapGraph({ onSelect }: { onSelect: (id: string, a: NodeAttrs) => void }) {
  const dict = useDictionary()
  const theme = useResolvedTheme()
  const graph = useMemo(() => buildMorphemeMap(dict, readPalette()), [dict, theme])
  return <SigmaGraph graph={graph} onNodeClick={onSelect} liveLayout labelThreshold={7} />
}

function FocusPanel({ focus }: { focus: string }) {
  const dict = useDictionary()
  const gloss = useGlossText()
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
        <div className="truncate text-sm text-muted">{gloss(ie)}</div>
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
  const gloss = useGlossText()
  useEffect(() => {
    if (!q.trim()) return setHits([])
    let alive = true
    void searchDictionary(q).then((h) => alive && setHits(h.slice(0, 8)))
    return () => {
      alive = false
    }
  }, [q])
  return (
    <div className="relative">
      <SearchField value={q} onValueChange={setQ} placeholder="単語・語根を中心に表示" className="[&_input]:h-10" />
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {hits.map((h) => {
            const label =
              h.kind === 'morpheme'
                ? (() => {
                    const m = dict.morphById.get(h.key)
                    return m ? `${morphLabel(m)}  ${m.meaning.ja}` : h.key
                  })()
                : `${headword(h.key)}  ${gloss(dict.byKey.get(h.key))}`
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

function NetworkInner() {
  const search = useSearch({ from: '/network' }) as NetworkSearch
  const navigate = useNavigate({ from: '/network' })
  const dict = useDictionary()
  const mode = search.mode ?? 'ego'
  const defaultFocus = useMemo(() => {
    const roots = dict.morphemes.filter((m) => m.type === 'root' && m.words.length >= 8)
    return roots.length ? 'm:' + roots[new Date().getDate() % roots.length].id : 'e:' + dict.entries[0].key
  }, [dict])
  const focus = search.focus ?? defaultFocus

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
        <div className="min-w-48 flex-1">
          <FocusSearch onPick={setFocus} />
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <Suspense fallback={<PageSpinner />}>
          {mode === 'map' ? <MapGraph onSelect={onSelect} /> : <EgoGraph focus={focus} onSelect={onSelect} />}
        </Suspense>
        <div className="pointer-events-none absolute left-3 top-3 hidden items-center gap-1.5 text-[11px] text-muted md:flex">
          {mode === 'map' ? <MapIcon className="size-3.5" /> : <Target className="size-3.5" />}
          {mode === 'map' ? 'ノードをタップで探索モードへ' : 'タップで中心を移動・中心をもう一度タップで詳細'}
        </div>
        <div className="pointer-events-none absolute left-3 top-3 md:left-auto md:right-3">
          <Legend />
        </div>
        {mode === 'ego' && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur md:inset-x-auto md:right-4 md:w-96">
            <FocusPanel focus={focus} />
            <Suspense fallback={null}>
              <ConnectionList focus={focus} onPick={setFocus} />
            </Suspense>
          </div>
        )}
        {mode === 'map' && (
          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] text-muted">
            <Maximize2 className="size-3.5" /> ピンチ・ホイールで拡大
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
