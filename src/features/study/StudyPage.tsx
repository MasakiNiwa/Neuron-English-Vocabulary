import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck, Play, Plus } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionSection } from '@/components/ui/Accordion'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { db, type StudyCard } from '@/lib/db'
import { EntryLink } from '@/features/dictionary/components/links'
import { useDictionary } from '@/features/dictionary/hooks'
import { selectClass } from '@/components/ui/Form'
import { useSettings } from '@/stores/settings'
import { formatInterval, removeFromStudy, retrievability } from './cards'
import { ReviewSession } from './ReviewSession'
const StudyReaction = lazy(() => import('@/features/ai/StudyReaction').then((m) => ({ default: m.StudyReaction })))
import { addNextFrequentWords, buildQueue, getStudyStats } from './session'

const STATE_LABEL = ['新規', '学習中', '復習', '再学習']

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-surface-2 px-2 py-3">
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  )
}

function CardList() {
  const dict = useDictionary()
  const [limit, setLimit] = useState(100)
  const cards = useLiveQuery(() => db.cards.orderBy('due').limit(limit).toArray(), [limit])
  const total = useLiveQuery(() => db.cards.count(), [])
  if (!cards) return null
  if (!cards.length) return <p className="text-sm text-muted">まだカードがありません。</p>
  const now = new Date()
  return (
    <>
      <div className="divide-y divide-border">
        {cards.map((c: StudyCard) => {
          const r = retrievability(c, now)
          return (
            <div key={c.entryId} className="flex items-center gap-2 py-2 text-sm">
              <EntryLink k={c.entryId} className="font-en w-32 shrink-0 truncate" />
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{dict.byKey.get(c.entryId)?.gloss}</span>
              <span className="w-12 shrink-0 text-right text-[11px] text-muted">{STATE_LABEL[c.state]}</span>
              <span className="w-14 shrink-0 text-right font-mono text-[11px] text-muted">
                {c.state === 0 ? '-' : c.due <= now.getTime() ? '期限' : formatInterval(new Date(c.due), now)}
              </span>
              <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted">
                {c.last_review ? `${Math.round(r * 100)}%` : ''}
              </span>
              <button
                type="button"
                onClick={() => void removeFromStudy(c.entryId)}
                className="shrink-0 text-xs text-muted hover:text-danger"
                aria-label="削除"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      {total !== undefined && total > limit && (
        <Button size="sm" className="mt-2 w-full" onClick={() => setLimit((l) => l + 200)}>
          もっと見る（{limit} / {total}）
        </Button>
      )}
    </>
  )
}

function StudyHome({ onStart }: { onStart: (q: StudyCard[]) => void }) {
  const { t } = useTranslation()
  const stats = useLiveQuery(getStudyStats, [])
  const startRank = useSettings((s) => s.studyStartRank)
  const setSetting = useSettings((s) => s.set)
  const [adding, setAdding] = useState(false)
  const add = async (n: number, type: 'w' | 'p' = 'w') => {
    setAdding(true)
    await addNextFrequentWords(n, type)
    setAdding(false)
  }
  const ready = (stats?.due ?? 0) + (stats?.newAvailable ?? 0)
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="復習" value={stats?.due ?? '–'} />
          <Stat label="新規" value={stats?.newAvailable ?? '–'} />
          <Stat label="今日の回答" value={stats?.reviewedToday ?? '–'} />
        </div>
        <Button
          variant="primary"
          size="lg"
          className="mt-4 w-full"
          disabled={!ready}
          onClick={async () => onStart(await buildQueue())}
        >
          <Play className="size-5" /> {ready ? `学習を始める（${ready}）` : '今日の学習は完了です'}
        </Button>
        <p className="mt-2 text-center text-xs text-muted">
          FSRS（間隔反復アルゴリズム）が、忘れかけた頃に復習を出題します。カード総数 {stats?.total ?? 0}
        </p>
      </Card>

      <Card>
        <SectionTitle>カードを追加</SectionTitle>
        <p className="mb-3 text-xs text-muted">
          頻度の高い順に、まだ追加していない単語を追加します。単語ページや語根ページからも追加できます。
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-muted">頻度順位</span>
          <select
            className={selectClass + ' w-28'}
            value={startRank}
            onChange={(e) => setSetting('studyStartRank', Number(e.target.value))}
          >
            {[1, 500, 1000, 2000, 3000, 5000, 7000].map((r) => (
              <option key={r} value={r}>
                {r} 位〜
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {[10, 20, 50].map((n) => (
            <Button key={n} size="sm" disabled={adding} onClick={() => void add(n)}>
              <Plus className="size-4" /> 単語 {n}
            </Button>
          ))}
          <Button size="sm" disabled={adding} onClick={() => void add(10, 'p')}>
            <Plus className="size-4" /> 熟語 10
          </Button>
        </div>
      </Card>

      <Accordion>
        <AccordionSection value="cards" title={`${t('study.title')}カード一覧`}>
          <Suspense fallback={<PageSpinner />}>
            <CardList />
          </Suspense>
        </AccordionSection>
      </Accordion>
    </div>
  )
}

export function StudyPage() {
  const { t } = useTranslation()
  const [queue, setQueue] = useState<StudyCard[] | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState(0)
  return (
    <Page title={t('study.title')}>
      <Suspense fallback={<PageSpinner />}>
        {queue ? (
          <ReviewSession
            queue={queue}
            onDone={(n) => {
              setQueue(null)
              setDone(n)
            }}
          />
        ) : (
          <>
            {done !== null && (
              <Card className="mb-4 border-success/40 bg-success/10">
                <div className="flex items-center gap-3">
                  <CircleCheck className="size-6 text-success" />
                  <span className="text-sm">お疲れさまでした！ {done} 枚のカードに回答しました。</span>
                </div>
                <Suspense fallback={null}>
                  <StudyReaction since={startedAt} />
                </Suspense>
              </Card>
            )}
            <StudyHome
              onStart={(q) => {
                setDone(null)
                setStartedAt(Date.now())
                setQueue(q)
              }}
            />
          </>
        )}
      </Suspense>
    </Page>
  )
}
