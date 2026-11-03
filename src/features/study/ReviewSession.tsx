import { Check, Eye, Mic, X } from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { db, type StudyCard } from '@/lib/db'
import { getSpeechRecognition, speak } from '@/lib/speech'
import { useSettings } from '@/stores/settings'
import { EntryLink, LinkedText, SpeakButton } from '@/features/dictionary/components/links'
import { useDictionary, useEntry, recordView } from '@/features/dictionary/hooks'
import { formatInterval, previewIntervals, Rating, review, type Grade } from './cards'
import { ChoicePrompt, ClozePrompt, JaPrompt, resolveFormat, type StudyFormat } from './formats'

/** 表面に見出し語が出る（最初に読み上げても答えにならない）形式 */
const SPEAK_FIRST = new Set<StudyFormat>(['en2ja', 'choice'])

const GRADES: { g: Grade; label: string; key: string; cls: string }[] = [
  { g: Rating.Again, label: 'もう一度', key: '1', cls: 'border-danger/40 text-danger' },
  { g: Rating.Hard, label: '難しい', key: '2', cls: 'border-warn/40 text-warn' },
  { g: Rating.Good, label: '正解', key: '3', cls: 'border-success/40 text-success' },
  { g: Rating.Easy, label: '簡単', key: '4', cls: 'border-accent/40 text-accent' },
]

/** 発音チェック（Web Speech API の音声認識） */
function PronunciationCheck({ target }: { target: string }) {
  const SR = getSpeechRecognition()
  const [state, setState] = useState<'idle' | 'listening' | 'ok' | 'ng'>('idle')
  const [heard, setHeard] = useState('')
  if (!SR) return null
  const start = () => {
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 5
    rec.continuous = false
    setState('listening')
    setHeard('')
    rec.onresult = (e) => {
      const alts = Array.from(e.results[0] as ArrayLike<{ transcript: string }>).map((a) => a.transcript.trim())
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').trim()
      const ok = alts.some((a) => norm(a) === norm(target) || norm(a).split(' ').includes(norm(target)))
      setHeard(alts[0] ?? '')
      setState(ok ? 'ok' : 'ng')
    }
    rec.onerror = () => setState('idle')
    rec.onend = () => setState((s) => (s === 'listening' ? 'idle' : s))
    rec.start()
  }
  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      <button
        type="button"
        onClick={start}
        className={
          'inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-muted hover:text-fg ' +
          (state === 'listening' ? 'animate-pulse border-accent text-accent' : '')
        }
      >
        <Mic className="size-4" /> 発音チェック
      </button>
      {state === 'ok' && (
        <span className="inline-flex items-center gap-1 text-success">
          <Check className="size-4" /> {heard}
        </span>
      )}
      {state === 'ng' && (
        <span className="inline-flex items-center gap-1 text-danger">
          <X className="size-4" /> {heard || '聞き取れませんでした'}
        </span>
      )}
    </div>
  )
}

function CardBack({ entryKey }: { entryKey: string }) {
  const entry = useEntry(entryKey)
  const dict = useDictionary()
  if (!entry) return null
  return (
    <div className="flex flex-col gap-3 text-left">
      <div className="flex flex-col gap-1">
        {entry.g.map((g, i) => (
          <div key={i} className="text-base">
            {g.ja.join('、')}
          </div>
        ))}
      </div>
      {entry.parts && (
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {entry.parts.map((p, i) => {
            const m = p.m && !p.m.startsWith('w:') ? dict.morphById.get(p.m) : null
            return (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && <span className="text-muted">+</span>}
                <span className="font-en font-semibold">{p.s}</span>
                {m && <span className="text-xs text-muted">({m.meaning.ja})</span>}
              </span>
            )
          })}
        </div>
      )}
      {entry.ex?.[0] && (
        <div className="rounded-xl bg-surface-2 p-2.5 text-sm">
          <div className="flex items-start gap-1">
            <p className="font-en flex-1">
              <LinkedText text={entry.ex[0].en} />
            </p>
            <SpeakButton text={entry.ex[0].en} size="sm" />
          </div>
          <p className="text-muted">{entry.ex[0].ja}</p>
        </div>
      )}
      <EntryLink k={entry.k} className="text-sm">
        単語ページで詳しく見る →
      </EntryLink>
    </div>
  )
}

export function ReviewSession({
  queue,
  onDone,
  mode = 'review',
  format = 'en2ja',
  initialIdx = 0,
  initialCount = 0,
  onProgress,
}: {
  queue: StudyCard[]
  onDone: (n: number) => void
  mode?: string
  format?: StudyFormat
  initialIdx?: number
  initialCount?: number
  /** 進み具合（ページ移動後の再開用） */
  onProgress?: (idx: number, count: number) => void
}) {
  const dict = useDictionary()
  const autoSpeak = useSettings((s) => s.autoSpeak)
  const [idx, setIdx] = useState(initialIdx)
  const [shown, setShown] = useState(false)
  const [card, setCard] = useState<StudyCard | null>(queue[0] ?? null)
  const startRef = useRef(Date.now())
  // 回答の連打で同じカードを 2 回評価しないためのロック（state だと次の描画まで反映されないので ref）
  const ratingRef = useRef(false)
  const backRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(initialCount)
  const [suggested, setSuggested] = useState<Grade | null>(null)

  // 学習中は画面スリープを防止（Screen Wake Lock API）
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    void navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => void lock?.release()
  }, [])

  useEffect(() => {
    const c = queue[idx]
    if (!c) return
    // 最新の状態を DB から取得（同セッション内で「もう一度」になったカードの再出題に対応）
    void db.cards.get(c.entryId).then((x) => setCard(x ?? c))
    setShown(false)
    setSuggested(null)
    ratingRef.current = false
    startRef.current = Date.now()
    // 表面に英語が出る形式だけ最初に読み上げる。日→英・穴埋めでは答えになるので、答えを見たときに読む（B13）
    if (autoSpeak && SPEAK_FIRST.has(format)) speak(c.entryId.replace(/_/g, ' '))
    // カードの登場アニメーション（Web Animations API）
    cardRef.current?.animate(
      [
        { opacity: 0, transform: 'translateY(12px) scale(0.98)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 220, easing: 'ease-out' },
    )
  }, [idx, queue, autoSpeak, format])

  const reveal = useCallback(() => {
    setShown(true)
    requestAnimationFrame(() =>
      backRef.current?.animate(
        [
          { opacity: 0, transform: 'rotateX(-70deg)' },
          { opacity: 1, transform: 'rotateX(0)' },
        ],
        { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' },
      ),
    )
    if (card) void recordView(card.entryId, 'study')
    if (card && autoSpeak && !SPEAK_FIRST.has(format)) speak(card.entryId.replace(/_/g, ' '))
  }, [card, autoSpeak, format])

  const rate = useCallback(
    async (g: Grade) => {
      if (!card || ratingRef.current) return
      ratingRef.current = true
      navigator.vibrate?.(g === Rating.Again ? [20, 40, 20] : 10)
      try {
        await review(card.entryId, g, { durationMs: Date.now() - startRef.current, mode: `${mode}:${format}` })
      } catch (e) {
        ratingRef.current = false
        throw e
      }
      // ロックは次のカードに切り替わったとき（下の useEffect）に外す
      setCount((n) => n + 1)
      onProgress?.(Math.min(idx + 1, queue.length - 1), count + 1)
      // 「もう一度」は数枚後に再出題
      if (g === Rating.Again) queue.splice(Math.min(queue.length, idx + 4), 0, card)
      if (idx + 1 >= queue.length) onDone(count + 1)
      else setIdx(idx + 1)
    },
    [card, idx, queue, onDone, count, mode, format],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        reveal()
      } else if (shown) {
        const g = GRADES.find((x) => x.key === e.key)
        if (g) void rate(g.g)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown, reveal, rate])

  if (!card) return null
  const ie = dict.byKey.get(card.entryId)
  const intervals = previewIntervals(card)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-all" style={{ width: `${(idx / queue.length) * 100}%` }} />
        </div>
        <span>
          {idx + 1} / {queue.length}
        </span>
        <button type="button" onClick={() => onDone(count)} className="ml-1 rounded-md px-1.5 py-0.5 hover:bg-surface-2 hover:text-fg">
          終了
        </button>
      </div>
      <div ref={cardRef} style={{ perspective: 800 }}>
        <Card className="flex min-h-80 flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="rounded-md bg-surface-2 px-1.5 text-[11px] text-muted">
            {card.state === 0 ? '新規' : '復習'}
            {ie && ` ・ ${ie.type === 'p' ? '熟語' : '#' + ie.rank}`}
          </span>
          <Suspense fallback={<PageSpinner />}>
            <CardFace
              key={`${idx}-${card.entryId}`}
              entryKey={card.entryId}
              format={format}
              shown={shown}
              onReveal={reveal}
              onSuggest={setSuggested}
              backRef={backRef}
            />
          </Suspense>
        </Card>
      </div>
      {shown && (
        <div className="grid grid-cols-4 gap-2">
          {GRADES.map((x) => (
            <button
              key={x.g}
              type="button"
              onClick={() => void rate(x.g)}
              className={`flex flex-col items-center rounded-xl border bg-surface py-2.5 hover:bg-surface-2 ${x.cls} ${suggested === x.g ? 'ring-2 ring-current' : ''}`}
            >
              <span className="text-sm font-medium">{x.label}</span>
              <span className="text-[11px] opacity-80">{formatInterval(intervals[x.g])}</span>
              <span className="hidden text-[10px] text-muted md:block">{x.key}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-center text-xs text-muted">回答 {count}</p>
    </div>
  )
}

/** カードの表面（出題形式ごと）と裏面 */
function CardFace({
  entryKey,
  format,
  shown,
  onReveal,
  onSuggest,
  backRef,
}: {
  entryKey: string
  format: StudyFormat
  shown: boolean
  onReveal: () => void
  onSuggest: (g: Grade | null) => void
  backRef: React.RefObject<HTMLDivElement | null>
}) {
  const entry = useEntry(entryKey)
  const fmt = useMemo(() => resolveFormat(format, entry), [format, entry])
  const [answered, setAnswered] = useState<number | null>(null)
  const head = entryKey.replace(/_/g, ' ')
  const showHead = fmt === 'en2ja' || fmt === 'choice' || shown
  return (
    <>
      {showHead && (
        <div className="flex items-center gap-1">
          <h2 className="font-en text-4xl font-semibold tracking-tight">{head}</h2>
          <SpeakButton text={head} />
        </div>
      )}
      {entry && fmt === 'ja2en' && !shown && <JaPrompt entry={entry} />}
      {entry && fmt === 'cloze' && <ClozePrompt entry={entry} revealed={shown} />}
      {entry && fmt === 'choice' && (
        <ChoicePrompt
          entry={entry}
          answered={answered}
          onAnswer={(i, correct) => {
            setAnswered(i)
            onSuggest(correct ? Rating.Good : Rating.Again)
            navigator.vibrate?.(correct ? 10 : [20, 40, 20])
            onReveal()
          }}
        />
      )}
      {!shown && fmt !== 'choice' && (
        <>
          {fmt === 'en2ja' && <PronunciationCheck target={head} />}
          <Button variant="primary" size="lg" className="mt-2 w-full max-w-xs" onClick={onReveal}>
            <Eye className="size-5" /> 答えを見る
          </Button>
          <span className="hidden text-[11px] text-muted md:block">Space</span>
        </>
      )}
      {shown && (
        <div ref={backRef} className="w-full origin-top">
          {fmt !== 'en2ja' && fmt !== 'choice' && <PronunciationCheck target={head} />}
          <CardBack entryKey={entryKey} />
        </div>
      )}
    </>
  )
}
