import { useMemo, useState } from 'react'
import { Segmented } from '@/components/ui/Form'
import type { ModuleProps } from './types'

/** 語根ごとの攻略状況。クリックで未学習の単語へドリルダウン */
export function RootsModule({ data, onDrill }: ModuleProps) {
  const [sort, setSort] = useState<'progress' | 'size'>('progress')
  const list = useMemo(() => {
    const r = data.roots.filter((x) => x.type === 'root')
    return sort === 'progress'
      ? r.sort((a, b) => b.seen / b.total - a.seen / a.total || b.total - a.total)
      : r.sort((a, b) => b.total - a.total)
  }, [data, sort])
  return (
    <div>
      <div className="mb-3">
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: 'progress', label: '攻略率順' },
            { value: 'size', label: '語数順' },
          ]}
        />
      </div>
      <div className="grid max-h-96 gap-1.5 overflow-auto pr-1 sm:grid-cols-2">
        {list.slice(0, 80).map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onDrill({ title: `語根 ${r.label}（${r.meaning}）: 未学習の単語`, keys: r.unseenKeys, morph: r.id })}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
          >
            <span className="font-en w-14 shrink-0 text-sm font-medium text-accent">{r.label}</span>
            <span className="w-20 shrink-0 truncate text-xs text-muted">{r.meaning}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${(r.seen / r.total) * 100}%` }} />
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted">
              {r.seen}/{r.total}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
