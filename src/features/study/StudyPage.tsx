import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNextRoot } from '@/features/lesson/RootsPage'

import { BookOpenCheck, CircleCheck, Mic, Play, RotateCcw, Shuffle, Sparkles } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionSection } from '@/components/ui/Accordion'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { db, type StudyCard } from '@/lib/db'
import { EntryLink, morphLabel } from '@/features/dictionary/components/links'
import { useDictionary } from '@/features/dictionary/hooks'
import { Segmented, selectClass } from '@/components/ui/Form'
import { useSettings } from '@/stores/settings'
import { usePersistentState } from '@/lib/persist'
import { useMinuteTick } from '@/lib/clock'
import { formatInterval, removeFromStudy, retrievability } from './cards'
import { ReviewSession } from './ReviewSession'
import { useStudySession } from './sessionStore'
import { formatOptions, type StudyFormat } from './formats'
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
    try {
      const keys = await pickNewWords(source, count, { type, rootId: rootId || roots[0]?.id })
      if (!keys.length) {
        setMsg(source === 'recent' ? '最近見た単語はすべて学習済みです。' : '新しく学べる単語がありません。')
        return
      }
      onStart(await startLearning(keys), 'learn')
    } catch (e) {
      // 失敗してもボタンが押せないままにならないようにする（B16）
      setMsg(`学習を始められませんでした: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
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
          </div>
        )}
        {source === 'frequency' && type === 'w' && (
          // どこから始めるか（レベル）。初回だけでなく常に選べる
          <LevelPicker value={startRank} onChange={(r) => setSetting('studyStartRank', r)} />
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

/** 今日の学習: 復習の時期が来たカード＋追加済みでまだ学習していないカード（辞書の「学習に追加」など） */
function ReviewCard({ onStart }: { onStart: (q: StudyCard[], mode: string) => void }) {
  const tick = useMinuteTick()
  const stats = useLiveQuery(getStudyStats, [tick])
  const due = stats?.due ?? 0
  const fresh = stats?.newAvailable ?? 0
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const go = async () => {
    setBusy(true)
    setMsg('')
    try {
      const q = await buildQueue()
      if (q.length) onStart(q, 'review')
      else setMsg('今は学習するカードがありません。')
    } catch (e) {
      setMsg(`始められませんでした: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <SectionTitle className="flex items-center gap-1.5">
            <RotateCcw className="size-4" /> 今日の学習
          </SectionTitle>
          {due || fresh ? (
            <p className="text-sm">
              {due > 0 && (
                <>
                  復習 <strong className="text-lg">{due}</strong> 枚
                </>
              )}
              {due > 0 && fresh > 0 && <span className="mx-1 text-muted">＋</span>}
              {fresh > 0 && (
                <>
                  追加済みの新しいカード <strong className="text-lg">{fresh}</strong> 枚
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted">今は復習の時期が来たカードはありません</p>
          )}
        </div>
        <Button variant={due || fresh ? 'primary' : 'secondary'} disabled={(!due && !fresh) || busy} onClick={() => void go()}>
          学習する
        </Button>
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
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
      <p className="mb-3 text-xs text-muted">復習の時期に関係なく、学習中のカード（{total ?? 0} 枚）から好きなだけ練習できます。答えた評価は記録され、次の復習日にも反映されます。</p>
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
  const options = formatOptions()
  const groups: { title: string; values: StudyFormat[] }[] = [
    { title: '意味を答える', values: ['en2ja', 'choice'] },
    { title: '英語を答える', values: ['ja2en', 'cloze'] },
    { title: '発音する', values: ['speak'] },
    { title: 'まとめて', values: ['mix'] },
  ]
  const HINT: Partial<Record<StudyFormat, string>> = {
    en2ja: '英語を見て意味を思い出し、答えを見て自分で評価する',
    choice: '英語を見て、4 つの中から意味を選ぶ',
    ja2en: '日本語の意味を見て英語を答える。書く・話す・答えを見る から選べ、ヒントは押したときだけ出る',
    cloze: '例文の空欄に入る英語を答える。書く・話す・答えを見る から選べ、ヒントは押したときだけ出る',
    speak: '英語を見て発音し、音声認識で聞き取れるか確かめる',
    mix: '英→日・4択・日→英・穴埋めをまぜて出す',
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="text-muted">出題形式</span>
      {groups.map((g) => {
        const opts = options.filter((o) => g.values.includes(o.value))
        if (!opts.length) return null
        return (
          <div key={g.title} className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 shrink-0 text-[11px] text-muted">{g.title}</span>
            {opts.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={format === o.value}
                onClick={() => set('studyFormat', o.value)}
                title={HINT[o.value]}
                className={
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ' +
                  (format === o.value ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-border text-muted hover:text-fg')
                }
              >
                {g.title === '発音する' && <Mic className="size-3.5" />}
                {o.label}
              </button>
            ))}
          </div>
        )
      })}
      {HINT[format] && <p className="text-[11px] text-muted">{HINT[format]}</p>}
    </div>
  )
}

/** どこから始めるか（よく使う順の開始位置）。ROADMAP U01。「新しい単語を学ぶ」の中で常に選べる */
const LEVELS: { rank: number; title: string; hint: string }[] = [
  { rank: 1, title: '基本から', hint: '頻度 1 位〜（the、have など最頻出語も確認）' },
  { rank: 500, title: '中学〜高校基礎', hint: '頻度 500 位〜' },
  { rank: 1000, title: '高校レベル', hint: '頻度 1000 位〜' },
  { rank: 2000, title: '大学入試レベル', hint: '頻度 2000 位〜' },
  { rank: 3000, title: '上級', hint: '頻度 3000 位〜' },
  { rank: 5000, title: '難関', hint: '頻度 5000 位〜' },
]

function LevelPicker({ value, onChange }: { value: number; onChange: (rank: number) => void }) {
  return (
    <div role="radiogroup" aria-label="どこから始めるか" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {LEVELS.map((l) => (
        <button
          key={l.rank}
          type="button"
          role="radio"
          aria-checked={value === l.rank}
          onClick={() => onChange(l.rank)}
          className={
            'rounded-xl border px-2.5 py-1.5 text-left ' +
            (value === l.rank ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2')
          }
        >
          <div className={'text-sm ' + (value === l.rank ? 'font-medium text-accent' : '')}>{l.title}</div>
          <div className="text-[11px] text-muted">{l.hint}</div>
        </button>
      ))}
    </div>
  )
}

/** 語根レッスンへの入口（次に学ぶとよい語根と、図鑑の進み具合） */
function RootLessonCard() {
  const info = useNextRoot()
  return (
    <Card className="flex flex-col gap-2">
      <SectionTitle className="flex items-center gap-1.5">
        <BookOpenCheck className="size-4" /> 語根で学ぶ
      </SectionTitle>
      <p className="text-xs text-muted">1 つの語根と、それを使う単語をまとめて学びます。部品の意味から単語の意味を当てるクイズ形式です。</p>
      <div className="flex flex-wrap items-center gap-2">
        {info?.next && (
          <Link
            to="/lesson/$id"
            params={{ id: info.next.id }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            <Sparkles className="size-4" /> <span className="font-en">{morphLabel(info.next)}</span>（{info.next.meaning.ja}）のレッスン
          </Link>
        )}
        <Link to="/roots" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm hover:bg-surface-2">
          語根図鑑 {info && <span className="tabular-nums text-muted">{info.done} / {info.total}</span>}
        </Link>
      </div>
    </Card>
  )
}

function StudyHome({ onStart }: { onStart: (q: StudyCard[], mode: string) => void }) {
  const { t } = useTranslation()
  const tick = useMinuteTick()
  const stats = useLiveQuery(getStudyStats, [tick])
  const today = (stats?.due ?? 0) + (stats?.newAvailable ?? 0)
  return (
    <div className="flex flex-col gap-4">
      <Steps />
      <FormatPicker />
      {/* 今日の学習（復習・追加済みの新規）があれば先頭に、なければ「新しく学ぶ」を先頭に */}
      {today > 0 && <ReviewCard onStart={onStart} />}
      <RootLessonCard />
      <div className="grid gap-4 md:grid-cols-2">
        <LearnCard onStart={onStart} />
        <PracticeCard onStart={onStart} />
      </div>
      {today === 0 && <ReviewCard onStart={onStart} />}
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
  const { queue, idx, count, mode, done, start, progress, finish } = useStudySession()
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
              </Card>
            )}
            <StudyHome onStart={start} />
          </>
        )}
      </Suspense>
    </Page>
  )
}
