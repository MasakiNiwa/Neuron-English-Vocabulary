import { Link, useParams } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpenCheck, Brain, Check, Eye, GitBranch, Layers, Lightbulb, ListChecks, NotebookPen, RotateCcw, Shuffle, Sparkles, X } from 'lucide-react'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/Form'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { db } from '@/lib/db'
import { usePersistentState } from '@/lib/persist'
import { EntryLink, MORPH_TYPE_LABEL, SpeakButton } from '@/features/dictionary/components/links'
import { useDictionary } from '@/features/dictionary/hooks'
import type { Morpheme } from '@/features/dictionary/types'
import { useSettings } from '@/stores/settings'
import type { Grade } from 'ts-fsrs'
import { dueEtyCards, lastKinds, recalled, REVIEW_LIMIT, saveDrill, type Answer } from './drill'
import { buildDrill, buildRandom, checkMemo, drillData, drillHints, drillLabel, KIND_LABEL, memoPlaceholder, morphWords, retryItem, type DrillItem, type MemoVerdict } from './questions'

/**
 * 語源ドリル（#/drill）。単語の「今日の学習」とは別枠で、語源そのものを覚える。
 * #/drill/$id は 1 つの語源を、作れる種類の問題すべてで練習する
 */

type Plan = { random?: number; only?: string[]; review?: string[]; practice?: string }

function MorphCard({ m, compact }: { m: Morpheme; compact?: boolean }) {
  const dict = useDictionary()
  const words = morphWords(dict, m).slice(0, compact ? 3 : 5)
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3 text-left text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Link to="/m/$id" params={{ id: m.id }} className="font-en text-lg font-semibold text-accent hover:underline">
          {drillLabel(m)}
        </Link>
        <span className="font-medium">{m.meaning.ja}</span>
        <span className="text-xs text-muted">
          {MORPH_TYPE_LABEL[m.type]}・{m.origin}
        </span>
      </div>
      {!compact && m.forms.length > 1 && <div className="font-en text-xs text-muted">形: {m.forms.join(', ')}</div>}
      {!compact && m.story?.ja && <p className="leading-relaxed">{m.story.ja}</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {words.map((w) => (
          <EntryLink key={w.key} k={w.key} className="text-xs">
            <span className="font-en">{w.key.replace(/_/g, ' ')}</span>
            <span className="ml-1 text-muted">{w.gloss.split('、')[0]}</span>
          </EntryLink>
        ))}
      </div>
    </div>
  )
}

/** 答えたあとの解説 */
function Explain({ item, ok }: { item: DrillItem; ok: boolean }) {
  const dict = useDictionary()
  const q = item.q
  const target = dict.morphById.get(q.target)!
  const right = q.choices.find((c) => c.correct)!
  // 選択肢の語源（意味を並べて、どう違うかを見せる）
  const others = q.choices
    .filter((c) => c.morph && c.morph !== q.target && c.morph !== right.morph)
    .map((c) => dict.morphById.get(c.morph!))
    .filter((m): m is Morpheme => !!m)
  const rightM = right.morph && right.morph !== q.target ? dict.morphById.get(right.morph) : null
  const ancestor = q.ancestor ? dict.morphById.get(q.ancestor) : null
  const kin = ancestor ? (ancestor.members ?? []).filter((id) => id !== q.target).map((id) => dict.morphById.get(id)).filter((m): m is Morpheme => !!m) : []
  return (
    <div className="flex w-full flex-col gap-2 text-left">
      {q.word && (
        <p className="text-center text-xs text-muted">
          <EntryLink k={q.word} className="text-xs">
            {q.head} の単語ページ
          </EntryLink>
        </p>
      )}
      {q.token && (
        <p className="rounded-xl bg-accent-soft p-3 text-sm leading-relaxed">
          <span className="font-en font-semibold">{q.compare?.map((id) => dict.morphById.get(id)).filter(Boolean).map((m) => drillLabel(m!)).join('・')}</span> は、どれも「{q.token}」を表す語源です。
        </p>
      )}
      {ancestor && (
        <p className="rounded-xl bg-accent-soft p-3 text-sm leading-relaxed">
          印欧祖語 <span className="font-en font-semibold">{ancestor.label}</span>（{ancestor.meaning.ja}）から生まれた語源:{' '}
          <span className="font-en">{kin.map((m) => drillLabel(m)).join('・')}</span>
          {ancestor.story?.ja && <span className="mt-1 block text-xs text-muted">{ancestor.story.ja}</span>}
        </p>
      )}
      <MorphCard m={target} compact={ok} />
      {rightM && <MorphCard m={rightM} compact />}
      {others.length > 0 && (
        <details className="rounded-xl border border-border p-2 text-sm" open={!ok || q.kind === 'similar'}>
          <summary className="cursor-pointer text-xs text-muted">{q.kind === 'similar' ? '似た意味の語源との違い' : 'ほかの選択肢の語源'}</summary>
          <div className="mt-2 flex flex-col gap-2">
            {others.map((m) => (
              <MorphCard key={m.id} m={m} compact />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

const GRADES: { g: Grade; label: string; key: string; cls: string }[] = [
  { g: 1, label: 'もう一度', key: '1', cls: 'border-danger/40 text-danger' },
  { g: 2, label: '難しい', key: '2', cls: 'border-warn/40 text-warn' },
  { g: 3, label: '正解', key: '3', cls: 'border-success/40 text-success' },
  { g: 4, label: '簡単', key: '4', cls: 'border-accent/40 text-accent' },
]

/**
 * 1 問。単語の学習と同じ流れ: メモを書いて答え合わせ（または答えを見る）。
 * 4 択は最初は隠してあり、押すと選んで答えられる。ヒントは押したときだけ 1 段ずつ。
 * 答えたあとに自分で評価を選ぶ（メモ・4 択の結果から評価を提案する）
 */
function QuestionCard({ item, onGrade }: { item: DrillItem; onGrade: (g: Grade) => void }) {
  const dict = useDictionary()
  const q = item.q
  const hints = useMemo(() => drillHints(dict, q), [dict, q])
  const [memo, setMemo] = useState('')
  const [hintLevel, setHintLevel] = useState(0)
  const [showChoices, setShowChoices] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [shown, setShown] = useState(false)
  const [verdict, setVerdict] = useState<MemoVerdict | null>(null)
  const [suggest, setSuggest] = useState<Grade | null>(null)
  const right = q.choices.find((c) => c.correct)!
  const rightM = right.morph ? dict.morphById.get(right.morph) : null
  // ヒントを使って正解したときは「難しい」を提案する
  const withHint = (g: Grade): Grade => (hintLevel > 0 && g === 3 ? 2 : g)

  const reveal = () => {
    if (shown) return
    const v = checkMemo(dict, q, memo)
    setVerdict(v)
    if (v) {
      setSuggest(v.kind === 'right' ? withHint(3) : v.kind === 'other' ? 2 : 1)
      navigator.vibrate?.(v.kind === 'wrong' ? [20, 40, 20] : 10)
    }
    setShown(true)
  }
  const pick = (k: number) => {
    if (shown) return
    const ok = q.choices[k].correct
    setPicked(k)
    setSuggest(ok ? withHint(3) : 1)
    navigator.vibrate?.(ok ? 10 : [20, 40, 20])
    setShown(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((e.key === 'Enter' || e.key === ' ') && el.closest('button:not(:disabled), a, summary')) return
      const k = Number(e.key) - 1
      if (!shown) {
        if (showChoices && k >= 0 && k < q.choices.length) pick(k)
        else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          reveal()
        }
      } else if (k >= 0 && k < 4) onGrade(GRADES[k].g)
      else if ((e.key === 'Enter' || e.key === ' ') && suggest) {
        e.preventDefault()
        onGrade(suggest)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const ok = picked !== null ? q.choices[picked].correct : verdict ? verdict.kind !== 'wrong' : (suggest ?? 3) >= 2
  return (
    <Card className="flex flex-col items-center gap-4 p-5 text-center">
      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
        {KIND_LABEL[q.kind]}
        {item.role === 'retry' && '・もう一度'}
      </span>
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          <h2 className={cn('font-semibold tracking-tight', q.headEn ? 'font-en text-4xl' : 'text-3xl')}>{q.head}</h2>
          {q.word && <SpeakButton text={q.head} />}
        </div>
        {q.sub && !(shown && q.kind === 'family') && <p className="text-sm text-muted">{q.sub}</p>}
      </div>
      <p className="text-sm">{q.prompt}</p>

      {!shown && hintLevel > 0 && (
        <ul className="w-full max-w-sm space-y-1 rounded-xl bg-surface-2 p-2.5 text-left text-sm">
          {hints.slice(0, hintLevel).map((h) => (
            <li key={h.label} className="flex gap-2">
              <span className="w-28 shrink-0 text-[11px] text-muted">{h.label}</span>
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      )}

      {(showChoices || picked !== null) && (
        <div className="grid w-full gap-2">
          {q.choices.map((c, k) => {
            const state = !shown ? 'idle' : c.correct ? 'correct' : picked === k ? 'wrong' : 'idle'
            return (
              <button
                key={k}
                type="button"
                disabled={shown}
                onClick={() => pick(k)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                  state === 'correct' ? 'border-success bg-success/15' : state === 'wrong' ? 'border-danger bg-danger/10' : 'border-border bg-surface hover:border-accent',
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs">{k + 1}</span>
                <span className={cn('flex-1', c.morph && q.kind !== 'e2m' && 'font-en text-base')}>{c.text}</span>
                {shown && c.morph && q.kind !== 'e2m' && <span className="text-xs text-muted">{dict.morphById.get(c.morph)?.meaning.ja}</span>}
                {state === 'correct' && <Check className="size-4 text-success" />}
                {state === 'wrong' && <X className="size-4 text-danger" />}
              </button>
            )
          })}
        </div>
      )}

      {!shown && (
        <>
          <form
            className="w-full max-w-sm"
            onSubmit={(e) => {
              e.preventDefault()
              reveal()
            }}
          >
            <label className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-surface-2/60 px-3 focus-within:border-muted">
              <NotebookPen className="size-4 shrink-0 text-muted" />
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                aria-label="回答メモ"
                placeholder={memoPlaceholder(q)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
                className={cn('h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted', q.kind !== 'e2m' && 'font-en')}
              />
            </label>
          </form>
          <div className="flex w-full max-w-sm gap-2 [&>button]:flex-1 [&>button]:whitespace-nowrap [&>button]:px-2">
            {!showChoices && (
              <Button onClick={() => setShowChoices(true)} className="h-11">
                <ListChecks className="size-4" /> 4 択で答える
              </Button>
            )}
            <Button variant="primary" onClick={reveal} className="h-11">
              {memo.trim() ? <Check className="size-4" /> : <Eye className="size-4" />} {memo.trim() ? '答え合わせ' : '答えを見る'}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            {hintLevel < hints.length && (
              <button type="button" onClick={() => setHintLevel((n) => n + 1)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-accent hover:bg-accent-soft">
                <Lightbulb className="size-3.5" /> {hintLevel === 0 ? 'ヒント' : 'もう少しヒント'}（{hintLevel + 1}/{hints.length}）
              </button>
            )}
            <span className="hidden text-[11px] text-muted md:block">Enter で答え合わせ{showChoices ? '・1〜4 で選ぶ' : ''}</span>
          </div>
        </>
      )}

      {shown && (
        <>
          <div className="flex w-full flex-col items-center gap-1">
            {picked !== null && <p className={cn('text-sm font-medium', ok ? 'text-success' : 'text-danger')}>{ok ? '正解！' : '不正解'}</p>}
            <p className="text-sm">
              <span className="text-muted">答え: </span>
              <span className={cn('font-semibold', right.morph && q.kind !== 'e2m' && 'font-en text-lg')}>{right.text}</span>
              {rightM && q.kind !== 'e2m' && <span className="ml-1 text-muted">（{rightM.meaning.ja}）</span>}
            </p>
          </div>
          {memo.trim() && (
            <div className="w-full rounded-xl border border-border p-2.5 text-left text-sm">
              <div className="flex gap-2">
                <span className="shrink-0 text-[11px] leading-5 text-muted">あなたのメモ</span>
                <span className="min-w-0 break-words">{memo}</span>
              </div>
              {verdict && picked === null && (
                <p className={cn('mt-1 flex items-start gap-1 text-xs', verdict.kind === 'right' ? 'text-success' : verdict.kind === 'other' ? 'text-warn' : 'text-muted')}>
                  {verdict.kind === 'right' && <Check className="mt-0.5 size-3.5 shrink-0" />}
                  {verdict.kind === 'right' ? `合っています${verdict.note ? `：${verdict.note}` : ''}` : verdict.kind === 'other' ? verdict.note : '答えとは違うようです（言い換えなら正解のこともあります）'}
                </p>
              )}
            </div>
          )}
          <Explain item={item} ok={ok} />
          <div className="grid w-full grid-cols-4 gap-1.5">
            {GRADES.map((x) => (
              <button
                key={x.g}
                type="button"
                onClick={() => onGrade(x.g)}
                className={cn('flex flex-col items-center rounded-xl border bg-surface px-1 py-2 text-sm font-medium transition-colors hover:bg-surface-2', x.cls, suggest === x.g && 'ring-2 ring-current')}
              >
                {x.label}
                <span className="hidden text-[10px] font-normal text-muted md:block">{x.key}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted">{suggest ? '枠の付いた評価がおすすめです（Enter）。思い出せた度合いで選んでください' : '思い出せた度合いで評価を選んでください'}</p>
        </>
      )}
    </Card>
  )
}

function Session({ plan, onDone }: { plan: Plan; onDone: () => void }) {
  const dict = useDictionary()
  const retention = useSettings((s) => s.desiredRetention)
  const [items, setItems] = useState<DrillItem[] | null>(null)
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let alive = true
    if (plan.random) setItems(buildRandom(dict, plan.random, Math.random, plan.only ? new Set(plan.only) : undefined))
    else void lastKinds([...(plan.review ?? [])]).then((lk) => alive && setItems(buildDrill(dict, plan, Math.random, lk)))
    return () => {
      alive = false
    }
  }, [dict, plan])

  const done = items !== null && i >= items.length
  useEffect(() => {
    if (done && !saved) {
      setSaved(true)
      void saveDrill(answers, retention)
    }
  }, [done, saved, answers, retention])

  const grade = (g: Grade) => {
    if (!items) return
    const item = items[i]
    setAnswers((a) => [...a, { q: item.q, rating: g, at: Date.now() }])
    // もう一度にした語源は、最後にもう一度（違う種類の問題で。1 回だけ）
    if (g === 1 && item.role !== 'retry') {
      const again = retryItem(dict, item.q)
      if (again) setItems([...items, again])
    }
    setI((n) => n + 1)
  }

  if (!items) return <PageSpinner />
  if (!items.length)
    return (
      <Card className="text-sm text-muted">
        問題を作れませんでした。
        <Button className="ml-2" onClick={onDone}>
          戻る
        </Button>
      </Card>
    )
  if (done) return <Summary answers={answers} onDone={onDone} />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1" aria-label={`${i + 1} / ${items.length} 問目`}>
        {items.map((_, k) => (
          <span
            key={k}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              k < answers.length ? (answers[k].rating >= 3 ? 'bg-success' : answers[k].rating === 2 ? 'bg-warn' : 'bg-danger') : k === i ? 'bg-accent' : 'bg-surface-2',
            )}
          />
        ))}
      </div>
      <QuestionCard key={i} item={items[i]} onGrade={grade} />
    </div>
  )
}

function Summary({ answers, onDone }: { answers: Answer[]; onDone: () => void }) {
  const dict = useDictionary()
  const by = new Map<string, Grade>()
  for (const a of answers) by.set(a.q.target, Math.min(by.get(a.q.target) ?? 4, a.rating) as Grade)
  const got = answers.filter(recalled).length
  return (
    <Card className="flex flex-col items-center gap-4 p-6 text-center">
      <Sparkles className="size-8 text-accent" />
      <h2 className="text-2xl font-semibold">
        {got} / {answers.length} 問 思い出せた
      </h2>
      <p className="max-w-sm text-sm text-muted">語源ごとに次の復習日を決めました（そのドリルでいちばん低い評価で）。思い出せた語源は間をあけて、「もう一度」の語源はすぐにまた出します。</p>
      <ul className="flex w-full max-w-md flex-col gap-1.5 text-left text-sm">
        {[...by].map(([id, g]) => {
          const m = dict.morphById.get(id)
          if (!m) return null
          return (
            <li key={id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
              {g >= 3 ? <Check className="size-4 text-success" /> : g === 2 ? <Check className="size-4 text-warn" /> : <X className="size-4 text-danger" />}
              <Link to="/m/$id" params={{ id }} className="font-en font-semibold text-accent hover:underline">
                {drillLabel(m)}
              </Link>
              <span className="flex-1 truncate">{m.meaning.ja}</span>
              <Link to="/drill/$id" params={{ id }} className="text-xs text-muted hover:text-accent">
                練習
              </Link>
            </li>
          )
        })}
      </ul>
      <Button variant="primary" size="lg" className="w-full max-w-xs" onClick={onDone}>
        ドリルのトップへ
      </Button>
    </Card>
  )
}

const COUNTS = [10, 20, 30] as const

function Hub({ onStart }: { onStart: (p: Plan) => void }) {
  const dict = useDictionary()
  const pool = useMemo(() => drillData(dict).pool, [dict])
  const now = useMemo(() => Date.now(), [])
  const due = useLiveQuery(() => dueEtyCards(now), [now])
  const have = useLiveQuery(() => db.etyCards.toCollection().primaryKeys(), [])
  const [n, setN] = usePersistentState<number>('drill:count', 10)
  const [range, setRange] = usePersistentState<'all' | 'seen'>('drill:range', 'all')
  if (!due || !have) return <PageSpinner />
  const haveSet = new Set(have)
  const seen = pool.filter((m) => haveSet.has(m.id)).map((m) => m.id)
  const review = due.slice(0, REVIEW_LIMIT).map((c) => c.entryId)
  const canSeen = seen.length >= 8
  const useSeen = range === 'seen' && canSeen
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted">
        語源（語根・接頭辞・接尾辞）そのものの知識を問うドリルです。すべての語源から、意味・単語の中の語源・似た意味の見分け・同じ祖先などをランダムに出題します。単語の学習と同じく、メモを書いて答え合わせ（4 択・ヒントは必要なときだけ）。評価から語源ごとに復習日を決めます（単語の「今日の学習」とは別枠）。
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-2 p-4">
          <div className="text-xs text-muted">復習する語源</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{due.length}</div>
        </div>
        <div className="rounded-2xl bg-surface-2 p-4">
          <div className="text-xs text-muted">解いたことのある語源</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {seen.length}
            <span className="ml-1 text-base font-normal text-muted">/ {pool.length}</span>
          </div>
        </div>
      </div>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">問題数</span>
          <Segmented<string> value={String(n)} onChange={(v) => setN(Number(v))} options={COUNTS.map((c) => ({ value: String(c), label: `${c} 問` }))} />
        </div>
        {/* 解いた語源が少ないうちは範囲を選ばせない（同じ語源ばかりになるので） */}
        {canSeen && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">範囲</span>
          <Segmented<'all' | 'seen'>
            value={useSeen ? 'seen' : 'all'}
            onChange={setRange}
            options={[
              { value: 'all', label: `すべて（${pool.length}）` },
              { value: 'seen', label: `解いたことのある語源（${seen.length}）` },
            ]}
          />
        </div>
        )}
        <Button variant="primary" size="lg" onClick={() => onStart({ random: n, only: useSeen ? seen : undefined })}>
          <Shuffle className="size-5" /> ランダムに {n} 問
        </Button>
        {review.length > 0 && (
          <Button size="lg" onClick={() => onStart({ review })}>
            <RotateCcw className="size-5" /> 復習する（{review.length} 個）
          </Button>
        )}
      </Card>
      <Card className="flex flex-col gap-2 text-sm">
        <h2 className="text-sm font-semibold text-muted">問題の種類</h2>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          <li className="flex gap-2">
            <Brain className="mt-0.5 size-4 shrink-0 text-accent" /> 語源 → 意味・意味 → 語源
          </li>
          <li className="flex gap-2">
            <BookOpenCheck className="mt-0.5 size-4 shrink-0 text-accent" /> 単語の中の語源を見つける
          </li>
          <li className="flex gap-2">
            <Layers className="mt-0.5 size-4 shrink-0 text-accent" /> 似た意味の語源の見分け（「見る」の spec・vid・scope など）
          </li>
          <li className="flex gap-2">
            <GitBranch className="mt-0.5 size-4 shrink-0 text-accent" /> 同じ祖先（印欧祖語）から生まれた語源
          </li>
        </ul>
        <p className="text-xs text-muted">
          1 つの語源だけを練習するときは、語源のページの「ドリルで練習」から。<Link to="/roots" className="text-accent">語根図鑑</Link>
          の語根レッスンでは、語根を使う単語の意味を当てます。
        </p>
      </Card>
    </div>
  )
}

function DrillInner({ practice }: { practice?: string }) {
  const [plan, setPlan] = useState<Plan | null>(practice ? { practice } : null)
  useEffect(() => setPlan(practice ? { practice } : null), [practice])
  if (plan) return <Session key={JSON.stringify(plan)} plan={plan} onDone={() => setPlan(null)} />
  return <Hub onStart={setPlan} />
}

const title = (
  <span className="inline-flex items-center gap-2">
    <Brain className="size-6" /> 語源ドリル
  </span>
)

export function DrillPage() {
  return (
    <Page title={title}>
      <Suspense fallback={<PageSpinner />}>
        <DrillInner />
      </Suspense>
    </Page>
  )
}

export function DrillMorphPage() {
  const { id } = useParams({ from: '/drill/$id' })
  return (
    <Page title={title}>
      <Suspense fallback={<PageSpinner />}>
        <DrillInner practice={id} />
      </Suspense>
    </Page>
  )
}
