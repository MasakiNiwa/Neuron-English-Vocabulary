import { Eye, ListChecks } from 'lucide-react'
import { SpeakPrompt, suggestFromScore } from './SpeakPrompt'
import { SpeakCheck } from '@/features/speech/SpeakCheck'
import { reduceMotion } from '@/lib/motion'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { db, type StudyCard } from '@/lib/db'
import { speak } from '@/lib/speech'
import { useSettings } from '@/stores/settings'
import { EntryLink, LinkedText, SpeakButton } from '@/features/dictionary/components/links'
import { useDictionary, useEntry, recordView } from '@/features/dictionary/hooks'
import { formatInterval, previewIntervals, Rating, review, type Grade } from './cards'
import { ChoicePrompt, ClozePrompt, findCloze, JaPrompt, pickFormat, type ConcreteFormat } from './formats'
import { ListenPrompt } from './ListenPrompt'
import { ProduceAnswer } from './ProduceAnswer'

/** 表面に見出し語が出る（最初に読み上げても答えにならない）形式 */
const SPEAK_FIRST = new Set<ConcreteFormat>(['en2ja', 'choice'])
/** 聞いて答える形式（出題のときに自分で流すので、自動の読み上げはしない） */
const LISTENING = new Set<ConcreteFormat>(['listen', 'dictation'])

const GRADES: { g: Grade; label: string; key: string; cls: string; hint: string }[] = [
  { g: Rating.Again, label: 'もう一度', key: '1', cls: 'border-danger/40 text-danger', hint: '思い出せなかった。数枚後にもう一度出題し、次の復習は近くなる' },
  { g: Rating.Hard, label: '難しい', key: '2', cls: 'border-warn/40 text-warn', hint: '思い出せたが時間がかかった・自信がない。間隔は少しだけ伸びる' },
  { g: Rating.Good, label: '正解', key: '3', cls: 'border-success/40 text-success', hint: '思い出せた。ふつうの間隔で次の復習日を決める' },
  { g: Rating.Easy, label: '簡単', key: '4', cls: 'border-accent/40 text-accent', hint: 'すぐに思い出せた。間隔が大きく伸びる' },
]

/** 評価ボタンの意味（U03） */
function GradeHelp() {
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer select-none text-center">評価の目安</summary>
      <ul className="mt-1 space-y-0.5 rounded-xl bg-surface-2 p-2.5">
        {GRADES.map((x) => (
          <li key={x.g}>
            <span className={`font-medium ${x.cls.split(' ').find((c) => c.startsWith('text-'))}`}>{x.label}</span>：{x.hint}
          </li>
        ))}
        <li className="pt-1">ボタンの下の時間は、それを選んだときの次の復習までの間隔です。自由練習で答えた分も記録され、次の復習日に反映されます。</li>
      </ul>
    </details>
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
      {entry.note?.ja && (
        // 書き下ろしの解説（語源と意味のつながり）。カードが長くなりすぎないよう開閉式に（U02）
        <details className="rounded-xl border border-border p-2.5 text-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-accent">解説を読む</summary>
          <p className="mt-1.5 leading-relaxed">
            <LinkedText text={entry.note.ja} />
          </p>
        </details>
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
  formats = ['en2ja'],
  auto = false,
  initialIdx = 0,
  initialCount = 0,
  onProgress,
}: {
  queue: StudyCard[]
  onDone: (n: number) => void
  mode?: string
  /** 出題形式（選んだ中からカードごとに選ぶ） */
  formats?: ConcreteFormat[]
  /** おまかせ: 覚え具合に合わせて形式を選ぶ */
  auto?: boolean
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
  // このカードで実際に出した形式（カードの表面が語を読み込んでから決まる）
  const [fmt, setFmt] = useState<ConcreteFormat | null>(null)

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
    setFmt(null)
    ratingRef.current = false
    startRef.current = Date.now()
    // カードの登場アニメーション（Web Animations API。モーションを減らすときは省く）
    if (!reduceMotion())
      cardRef.current?.animate(
        [
          { opacity: 0, transform: 'translateY(12px) scale(0.98)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 220, easing: 'ease-out' },
      )
  }, [idx, queue])

  // 表面に英語が出る形式だけ最初に読み上げる。日→英・穴埋めでは答えになるので、答えを見たときに読む（B13）
  useEffect(() => {
    if (autoSpeak && fmt && SPEAK_FIRST.has(fmt) && card) speak(card.entryId.replace(/_/g, ' '))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmt])

  const reveal = useCallback(() => {
    setShown(true)
    if (!reduceMotion())
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
    if (card && autoSpeak && fmt && !SPEAK_FIRST.has(fmt) && !LISTENING.has(fmt)) speak(card.entryId.replace(/_/g, ' '))
  }, [card, autoSpeak, fmt])

  const rate = useCallback(
    async (g: Grade) => {
      if (!card || ratingRef.current) return
      ratingRef.current = true
      navigator.vibrate?.(g === Rating.Again ? [20, 40, 20] : 10)
      try {
        await review(card.entryId, g, { durationMs: Date.now() - startRef.current, mode: `${mode}:${fmt ?? 'en2ja'}` })
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
    [card, idx, queue, onDone, count, mode, fmt],
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
              card={card}
              formats={formats}
              auto={auto}
              onFormat={setFmt}
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
              title={x.hint}
              className={`flex flex-col items-center rounded-xl border bg-surface py-2.5 hover:bg-surface-2 ${x.cls} ${suggested === x.g ? 'ring-2 ring-current' : ''}`}
            >
              <span className="text-sm font-medium">{x.label}</span>
              <span className="text-[11px] opacity-80">{formatInterval(intervals[x.g])}</span>
              <span className="hidden text-[10px] text-muted md:block">{x.key}</span>
            </button>
          ))}
        </div>
      )}
      {shown && <GradeHelp />}
      <p className="text-center text-xs text-muted">回答 {count}</p>
    </div>
  )
}

/** カードの表面（出題形式ごと）と裏面 */
function CardFace({
  entryKey,
  card,
  formats,
  auto,
  onFormat,
  shown,
  onReveal,
  onSuggest,
  backRef,
}: {
  entryKey: string
  card: StudyCard
  formats: ConcreteFormat[]
  auto: boolean
  onFormat: (f: ConcreteFormat) => void
  shown: boolean
  onReveal: () => void
  onSuggest: (g: Grade | null) => void
  backRef: React.RefObject<HTMLDivElement | null>
}) {
  const entry = useEntry(entryKey)
  // カードごとに 1 回だけ選ぶ（描画のたびに変わらないように）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fmt = useMemo(() => pickFormat(formats, auto, entry, card), [entry])
  useEffect(() => onFormat(fmt), [fmt, onFormat])
  const [answered, setAnswered] = useState<number | null>(null)
  // 聞いて意味: 答えを見る か 4 択で答える
  const [listenChoice, setListenChoice] = useState(false)
  const head = entryKey.replace(/_/g, ' ')
  const showHead = fmt === 'en2ja' || fmt === 'choice' || fmt === 'speak' || shown
  // 英語を答える問題（書く / 話す / 答えを見る）。穴埋めは例文中の形も正解にする
  const produce = fmt === 'ja2en' || fmt === 'cloze' || fmt === 'dictation'
  const cloze = entry && fmt === 'cloze' ? findCloze(entry) : null
  const answer = cloze ? cloze.ex.en.slice(cloze.start, cloze.end) : head
  const targets = entry ? [answer, head, ...(entry.forms ?? [])] : [head]
  return (
    <>
      {showHead && (
        <div className="flex items-center gap-1">
          <h2 className="font-en text-4xl font-semibold tracking-tight">{head}</h2>
          <SpeakButton text={head} />
        </div>
      )}
      {entry && fmt === 'ja2en' && !shown && <JaPrompt entry={entry} />}
      {(fmt === 'listen' || fmt === 'dictation') && !shown && (
        <ListenPrompt text={head} hint={fmt === 'listen' ? '聞こえた英語の意味は？' : '聞こえた英語を書いてください'} />
      )}
      {fmt === 'speak' && (
        // 発音で答える: 話し終えたら答えを表示し、点数から評価を提案する（もう一度話すと提案も更新）
        <SpeakPrompt
          target={head}
          mode="speak"
          onResult={(r) => {
            const s = suggestFromScore(r.score)
            onSuggest(s === 'good' ? Rating.Good : s === 'hard' ? Rating.Hard : Rating.Again)
            navigator.vibrate?.(s === 'again' ? [20, 40, 20] : 10)
            onReveal()
          }}
        />
      )}
      {entry && fmt === 'cloze' && <ClozePrompt entry={entry} revealed={shown} />}
      {entry && produce && (
        <ProduceAnswer
          key={entryKey}
          entry={entry}
          answer={answer}
          targets={fmt === 'dictation' ? [head] : targets}
          shown={shown}
          onReveal={onReveal}
          onSuggest={onSuggest}
          initialMode={fmt === 'dictation' ? 'write' : null}
          allowSpeak={fmt !== 'dictation'}
        />
      )}
      {entry && (fmt === 'choice' || (fmt === 'listen' && listenChoice)) && (
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
      {!shown && fmt === 'speak' && (
        // 声を出せないとき用。タップで進めることが一目で分かるようボタンの形にし、キーの案内は PC だけに出す
        <div className="flex flex-col items-center gap-1">
          <span className="text-[11px] text-muted">声を出せないときは</span>
          <Button size="sm" onClick={onReveal}>
            <Eye className="size-4" /> 答えを見る
          </Button>
          <span className="hidden text-[11px] text-muted md:block">Space</span>
        </div>
      )}
      {!shown && fmt === 'listen' && !listenChoice && (
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button variant="primary" size="lg" onClick={onReveal}>
            <Eye className="size-5" /> 答えを見る
          </Button>
          <Button onClick={() => setListenChoice(true)}>
            <ListChecks className="size-4" /> 4択で答える
          </Button>
          <span className="hidden text-center text-[11px] text-muted md:block">Space で答えを見る</span>
        </div>
      )}
      {!shown && fmt === 'en2ja' && (
        <>
          <Button variant="primary" size="lg" className="mt-2 w-full max-w-xs" onClick={onReveal}>
            <Eye className="size-5" /> 答えを見る
          </Button>
          <span className="hidden text-[11px] text-muted md:block">Space</span>
        </>
      )}
      {shown && (
        <div ref={backRef} className="w-full origin-top">
          {fmt !== 'speak' && (
            // 発音で答える形式以外でも、答えを見たあとに発音を試せる
            <details className="mb-3 text-left">
              <summary className="cursor-pointer select-none text-center text-xs text-accent">この単語を発音してみる</summary>
              <div className="mt-2 rounded-xl border border-border p-3">
                <SpeakCheck target={head} compact autoStart />
              </div>
            </details>
          )}
          <CardBack entryKey={entryKey} />
        </div>
      )}
    </>
  )
}
