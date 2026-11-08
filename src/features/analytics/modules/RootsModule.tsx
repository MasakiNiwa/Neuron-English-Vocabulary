import { useMemo, useState } from 'react'
import { Segmented } from '@/components/ui/Form'
import type { ModuleProps } from './types'

/**
 * 語根ごとの学びの段階。重ならない 3 つに分けて積み上げる:
 * 日をあけて思い出せた（濃い）・学習中（中）・見ただけ（薄い）。残りはまだ触れていない語
 */
export function RootsModule({ data, onDrill }: ModuleProps) {
  const [sort, setSort] = useState<'progress' | 'size'>('progress')
  const list = useMemo(() => {
    const r = data.roots.filter((x) => x.type === 'root')
    const score = (x: (typeof r)[number]) => (x.recalledKeys.length * 3 + x.studiedKeys.length * 2 + x.viewedOnlyKeys.length) / x.total
    return sort === 'progress' ? r.sort((a, b) => score(b) - score(a) || b.total - a.total) : r.sort((a, b) => b.total - a.total)
  }, [data, sort])
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: 'progress', label: '進んでいる順' },
            { value: 'size', label: '語数順' },
          ]}
        />
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-accent" />日をあけて思い出せた</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-accent/50" />学習中</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-accent/20" />見ただけ</span>
        </span>
      </div>
      <div className="grid max-h-96 gap-1.5 overflow-auto pr-1 sm:grid-cols-2">
        {list.slice(0, 80).map((r) => {
          const recalled = r.recalledKeys.length
          const studying = r.studiedKeys.length - recalled
          const viewed = r.viewedOnlyKeys.length
          const w = (n: number) => `${(n / r.total) * 100}%`
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onDrill({ title: `語根 ${r.label}（${r.meaning}）: まだ学習していない語`, keys: [...r.viewedOnlyKeys, ...r.unseenKeys], morph: r.id })}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
              title={`日をあけて思い出せた ${recalled}・学習中 ${studying}・見ただけ ${viewed}・まだ ${r.total - recalled - studying - viewed}`}
            >
              <span className="font-en w-14 shrink-0 text-sm font-medium text-accent">{r.label}</span>
              <span className="w-20 shrink-0 truncate text-xs text-muted">{r.meaning}</span>
              <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="h-full bg-accent" style={{ width: w(recalled) }} />
                <span className="h-full bg-accent/50" style={{ width: w(studying) }} />
                <span className="h-full bg-accent/20" style={{ width: w(viewed) }} />
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted">
                {r.studiedKeys.length}/{r.total}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
