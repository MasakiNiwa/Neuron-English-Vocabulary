import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpenCheck, Sparkles } from 'lucide-react'
import { Suspense, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/Form'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { db, type RootLesson } from '@/lib/db'
import { usePersistentState } from '@/lib/persist'
import { morphLabel } from '@/features/dictionary/components/links'
import { useDictionary } from '@/features/dictionary/hooks'
import { StarRow } from './LessonPage'
import { lessonRoots, rootWords, stars } from './lessons'

type Filter = 'all' | 'got' | 'todo'

/** 次に学ぶとよい語根（まだレッスンをしていない語根のうち、よく使う単語を含む順の先頭） */
export function useNextRoot() {
  const dict = useDictionary()
  const done = useLiveQuery(() => db.rootLessons.toCollection().primaryKeys(), [])
  return useMemo(() => {
    if (!done) return undefined
    const set = new Set(done)
    const roots = lessonRoots(dict)
    return { next: roots.find((m) => !set.has(m.id)), done: roots.filter((m) => set.has(m.id)).length, total: roots.length }
  }, [dict, done])
}

function RootsInner() {
  const dict = useDictionary()
  const roots = useMemo(() => lessonRoots(dict), [dict])
  const records = useLiveQuery(() => db.rootLessons.toArray(), [])
  const [filter, setFilter] = usePersistentState<Filter>('roots:filter', 'all')
  if (!records) return <PageSpinner />
  const byId = new Map<string, RootLesson>(records.map((r) => [r.id, r]))
  const got = roots.filter((m) => byId.has(m.id)).length
  const shown = roots.filter((m) => (filter === 'got' ? byId.has(m.id) : filter === 'todo' ? !byId.has(m.id) : true))
  const next = roots.find((m) => !byId.has(m.id))
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-xs text-muted">集めた語根</div>
            <div className="text-3xl font-semibold tabular-nums">
              {got}
              <span className="ml-1 text-base font-normal text-muted">/ {roots.length}</span>
            </div>
          </div>
          {next && (
            <Link
              to="/lesson/$id"
              params={{ id: next.id }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              <Sparkles className="size-4" /> 次の語根: <span className="font-en">{morphLabel(next)}</span>
            </Link>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-all" style={{ width: `${(got / Math.max(1, roots.length)) * 100}%` }} />
        </div>
        <p className="text-xs text-muted">語根レッスンを終えると、その語根が図鑑に登録されます。よく使う単語を含む語根から順に並んでいます。</p>
      </Card>
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'すべて' },
          { value: 'got', label: `集めた（${got}）` },
          { value: 'todo', label: `まだ（${roots.length - got}）` },
        ]}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((m) => {
          const r = byId.get(m.id)
          const n = rootWords(dict, m).length
          return (
            <Link
              key={m.id}
              to="/lesson/$id"
              params={{ id: m.id }}
              className={cn(
                'flex flex-col gap-0.5 rounded-2xl border p-3 transition-colors hover:border-accent',
                r ? 'border-accent/40 bg-accent-soft' : 'border-dashed border-border bg-surface',
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={cn('font-en text-lg font-semibold', !r && 'text-muted')}>{morphLabel(m)}</span>
                {r && <StarRow n={stars(r.best, r.total)} size="sm" />}
              </div>
              <span className="truncate text-xs">{m.meaning.ja}</span>
              <span className="text-[11px] text-muted">{r ? `最高 ${r.best} / ${r.total}・${r.plays} 回` : `${n} 語`}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function RootsPage() {
  return (
    <Page
      title={
        <span className="inline-flex items-center gap-2">
          <BookOpenCheck className="size-6" /> 語根図鑑
        </span>
      }
    >
      <Suspense fallback={<PageSpinner />}>
        <RootsInner />
      </Suspense>
    </Page>
  )
}
