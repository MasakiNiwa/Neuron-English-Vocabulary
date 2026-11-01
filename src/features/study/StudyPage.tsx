import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck, Play, RotateCcw, Shuffle, Sparkles } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionSection } from '@/components/ui/Accordion'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { db, type StudyCard } from '@/lib/db'
import { EntryLink } from '@/features/dictionary/components/links'
import { useDictionary } from '@/features/dictionary/hooks'
import { Segmented, selectClass } from '@/components/ui/Form'
import { useSettings } from '@/stores/settings'
import { usePersistentState } from '@/lib/persist'
import { formatInterval, removeFromStudy, retrievability } from './cards'
import { ReviewSession } from './ReviewSession'
import { useStudySession } from './sessionStore'
import { FORMAT_OPTIONS, type StudyFormat } from './formats'
const StudyReaction = lazy(() => import('@/features/ai/StudyReaction').then((m) => ({ default: m.StudyReaction })))
import { buildPracticeQueue, buildQueue, getStudyStats, pickNewWords, startLearning, type LearnSource, type PracticeMode } from './session'

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

const COUNTS = [5, 10, 20, 50]

function Steps() {
  const steps = ['学ぶ単語を選ぶ', 'カードをめくって、思い出せたか評価', 'FSRS が次の復習日を自動で決める']
  return (
    <ol className="flex flex-col gap-1.5 text-sm sm:flex-row sm:gap-4">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
            {i + 1}
          </span>
          <span className="text-muted">{s}</span>
        </li>
      ))}
    </ol>
  )
}

function LearnCard({ onStart }: { onStart: (q: StudyCard[], mode: string) => void }) {
  const dict = useDictionary()
  const startRank = useSettings((s) => s.studyStartRank)
  const setSetting = useSettings((s) => s.set)
  const [source, setSource] = usePersistentState<LearnSource>('study:source', 'frequency')
  const [type, setType] = usePersistentState<'w' | 'p'>('study:type', 'w')
  const [rootId, setRootId] = usePersistentState('study:root', '')
  const [count, setCount] = usePersistentState('study:count', 10)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const roots = useMemo(
    () =>
      dict.morphemes
        .filter((m) => m.type === 'root' && m.words.length >= 4)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [dict],
  )
  const start = async () => {
    setBusy(true)
    setMsg('')
    const keys = await pickNewWords(source, count, { type, rootId: rootId || roots[0]?.id })
    if (!keys.length) {
      setMsg(source === 'recent' ? '最近見た単語はすべて学習済みです。' : '新しく学べる単語がありません。')
      setBusy(false)
      return
    }
    onStart(await startLearning(keys), 'learn')
  }
  return (
    <Card>
      <SectionTitle className="flex items-center gap-1.5">
        <Sparkles className="size-4" /> 新しい単語を学ぶ
      </SectionTitle>
      <div className="flex flex-col gap-3">
        <Segmented<LearnSource>
          value={source}
          onChange={setSource}
          options={[
            { value: 'frequency', label: 'よく使う順' },
            { value: 'recent', label: '最近見た単語' },
            { value: 'root', label: '語根から' },
          ]}
        />
        {source === 'frequency' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Segmented<'w' | 'p'>
              value={type}
              onChange={setType}
              options={[
                { value: 'w', label: '単語' },
                { value: 'p', label: '熟語' },
              ]}
            />
            {type === 'w' && (
              <select
                className={selectClass + ' w-32'}
                value={startRank}
                onChange={(e) => setSetting('studyStartRank', Number(e.target.value))}
                aria-label="開始する頻度順位"
              >
                {[1, 500, 1000, 2000, 3000, 5000, 7000].map((r) => (
                  <option key={r} value={r}>
                    頻度 {r} 位〜
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {source === 'root' && (
          <select className={selectClass + ' w-full max-w-none'} value={rootId || roots[0]?.id} onChange={(e) => setRootId(e.target.value)}>
            {roots.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}（{m.meaning.ja}）— {m.words.length}語
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">語数</span>
          <Segmented
            value={String(count)}
            onChange={(v) => setCount(Number(v))}
            options={COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>
        <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={() => void start()}>
          <Play className="size-5" /> 学習を始める
        </Button>
        {msg && <p className="text-center text-xs text-muted">{msg}</p>}
      </div>
    </Card>
  )
}

function ReviewCard({ onStart }: { onStart: (q: StudyCard[], mode: string) => void }) {
  const stats = useLiveQuery(getStudyStats, [])
  const due = stats?.due ?? 0
  return (
    <Card className="flex items-center gap-4">
      <div className="flex-1">
        <SectionTitle className="flex items-center gap-1.5">
          <RotateCcw className="size-4" /> 復習
        </SectionTitle>
        <p className="text-sm">
          {due ? (
            <>
              復習の時期が来たカードが <strong className="text-lg">{due}</strong> 枚あります
            </>
          ) : (
            <span className="text-muted">今は復習の時期が来たカードはありません</span>
          )}
        </p>
      </div>
      <Button variant={due ? 'primary' : 'secondary'} disabled={!due} onClick={async () => onStart(await buildQueue(), 'review')}>
        復習する
      </Button>
    </Card>
  )
}

function PracticeCard({ onStart }: { onStart: (q: StudyCard[], mode: string) => void }) {
  const total = useLiveQuery(() => db.cards.count(), [])
  const [mode, setMode] = usePersistentState<PracticeMode>('study:practiceMode', 'random')
  const [count, setCount] = usePersistentState('study:practiceCount', 10)
  return (
    <Card>
      <SectionTitle className="flex items-center gap-1.5">
        <Shuffle className="size-4" /> 自由に練習
      </SectionTitle>
      <p className="mb-3 text-xs text-muted">復習の時期に関係なく、学習中のカード（{total ?? 0} 枚）から好きなだけ練習できます。</p>
      <div className="flex flex-col gap-3">
        <Segmented<PracticeMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'random', label: 'ランダム' },
            { value: 'weak', label: '苦手な順' },
            { value: 'recent', label: '最近追加' },
          ]}
        />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">枚数</span>
          <Segmented
            value={String(count)}
            onChange={(v) => setCount(Number(v))}
            options={COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>
        <Button
          disabled={!total}
          onClick={async () => {
            const q = await buildPracticeQueue(mode, count)
            if (q.length) onStart(q, 'practice')
          }}
        >
          <Play className="size-4" /> 練習する
        </Button>
      </div>
    </Card>
  )
}

function FormatPicker() {
  const format = useSettings((s) => s.studyFormat)
  const set = useSettings((s) => s.set)
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">出題形式</span>
      <div className="max-w-full overflow-x-auto">
        <Segmented<StudyFormat> value={format} onChange={(v) => set('studyFormat', v)} options={FORMAT_OPTIONS} />
      </div>
    </div>
  )
}

function StudyHome({ onStart }: { onStart: (q: StudyCard[], mode: string) => void }) {
  const { t } = useTranslation()
  const stats = useLiveQuery(getStudyStats, [])
  return (
    <div className="flex flex-col gap-4">
      <Steps />
      <FormatPicker />
      {/* 復習待ちがあれば復習を先頭に、なければ「新しく学ぶ」を先頭に */}
      {!!stats?.due && <ReviewCard onStart={onStart} />}
      <div className="grid gap-4 md:grid-cols-2">
        <LearnCard onStart={onStart} />
        <PracticeCard onStart={onStart} />
      </div>
      {!stats?.due && <ReviewCard onStart={onStart} />}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="学習中のカード" value={stats?.total ?? '–'} />
        <Stat label="今日の回答" value={stats?.reviewedToday ?? '–'} />
        <Stat label="今日の新規" value={stats?.newToday ?? '–'} />
      </div>
      <Accordion persistKey="study">
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
  const format = useSettings((s) => s.studyFormat)
  const { queue, idx, count, mode, startedAt, done, start, progress, finish } = useStudySession()
  return (
    <Page title={t('study.title')}>
      <Suspense fallback={<PageSpinner />}>
        {queue ? (
          <ReviewSession
            queue={queue}
            mode={mode}
            format={format}
            initialIdx={idx}
            initialCount={count}
            onProgress={progress}
            onDone={finish}
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
            <StudyHome onStart={start} />
          </>
        )}
      </Suspense>
    </Page>
  )
}
