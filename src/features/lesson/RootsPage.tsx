import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpenCheck, Brain, Sparkles } from 'lucide-react'
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
import { lessonRoots, recalledAfterGap, rootProgress, STAGE_LABEL } from './lessons'

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
  // 学習で日をあけて思い出せた語（★3 の判定に使う）
  const recalled = useLiveQuery(async () => recalledAfterGap(await db.reviews.toArray()), [])
  const [filter, setFilter] = usePersistentState<Filter>('roots:filter', 'all')
  const progress = useMemo(() => {
    if (!records || !recalled) return null
    const byId = new Map<string, RootLesson>(records.map((r) => [r.id, r]))
    return new Map(roots.map((m) => [m.id, rootProgress(dict, m, byId.get(m.id), recalled)]))
  }, [records, recalled, roots, dict])
  if (!records || !progress) return <PageSpinner />
  const stageOf = (id: string) => progress.get(id)!.stage
  const count = (s: number) => roots.filter((m) => stageOf(m.id) === s).length
  const got = roots.filter((m) => stageOf(m.id) > 0).length
  const shown = roots.filter((m) => (filter === 'got' ? stageOf(m.id) > 0 : filter === 'todo' ? stageOf(m.id) === 0 : true))
  const next = roots.find((m) => stageOf(m.id) === 0)
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-xs text-muted">出会った語根</div>
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
        <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
          {[3, 2, 1].map((s) => (
            <div key={s} className={cn('h-full transition-all', s === 3 ? 'bg-accent' : s === 2 ? 'bg-accent/60' : 'bg-accent/30')} style={{ width: `${(count(s) / Math.max(1, roots.length)) * 100}%` }} />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {[1, 2, 3].map((s) => (
            <li key={s} className="inline-flex items-center gap-1">
              <StarRow n={s} size="sm" />
              {STAGE_LABEL[s]} <span className="tabular-nums text-muted">{count(s)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed text-muted">
          ★1 出会った＝レッスンを終えた、★2 見わけられる＝この語根の単語（よく使う順に最大 18 語）をすべてレッスンで正解した、★3
          身についた＝さらにその半分以上を学習で日をあけて思い出せた。レッスンを重ねると、まだ正解していない語から出題します。
        </p>
      </Card>
      <Link to="/drill" className="-mt-1 inline-flex items-center gap-1.5 self-start text-sm text-accent hover:underline">
        <Brain className="size-4" /> 語源ドリル（意味から語源・似た意味の見分け・同じ祖先）
      </Link>
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'すべて' },
          { value: 'got', label: `出会った（${got}）` },
          { value: 'todo', label: `まだ（${roots.length - got}）` },
        ]}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((m) => {
          const p = progress.get(m.id)!
          const r = p.stage > 0
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
                {r && <StarRow n={p.stage} size="sm" />}
              </div>
              <span className="truncate text-xs">{m.meaning.ja}</span>
              <span className="text-[11px] text-muted">{r ? `正解 ${p.mastered} / ${p.target} 語・思い出せた ${p.recalled}` : `${p.target} 語`}</span>
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
