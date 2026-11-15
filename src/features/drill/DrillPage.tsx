import { Link, useParams } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, BookOpenCheck, Brain, Check, GitBranch, Layers, RotateCcw, Shuffle, Sparkles, X } from 'lucide-react'
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
import { dueEtyCards, lastKinds, REVIEW_LIMIT, saveDrill, type Answer } from './drill'
import { buildDrill, buildRandom, drillData, drillLabel, KIND_LABEL, morphWords, retryItem, type DrillItem } from './questions'

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
function Explain({ item, picked }: { item: DrillItem; picked: number }) {
  const dict = useDictionary()
  const q = item.q
  const target = dict.morphById.get(q.target)!
  const right = q.choices.find((c) => c.correct)!
  const ok = q.choices[picked].correct
  // 選択肢の語源（意味を並べて、どう違うかを見せる）
  const others = q.choices
    .filter((c) => c.morph && c.morph !== q.target && c.morph !== right.morph)
    .map((c) => dict.morphById.get(c.morph!))
    .filter((m): m is Morpheme => !!m)
  const rightM = right.morph && right.morph !== q.target ? dict.morphById.get(right.morph) : null
  const ancestor = q.ancestor ? dict.morphById.get(q.ancestor) : null
  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <p className={cn('text-center text-sm font-medium', ok ? 'text-success' : 'text-danger')}>{ok ? '正解！' : `正解は「${right.text}」`}</p>
      {q.word && (
        <p className="text-center text-xs text-muted">
          <EntryLink k={q.word} className="text-xs">
            {q.head} の単語ページ
          </EntryLink>
        </p>
      )}
      {q.token && (
        <p className="rounded-xl bg-accent-soft p-3 text-sm leading-relaxed">
          選択肢の <span className="font-en font-semibold">{q.compare?.map((id) => dict.morphById.get(id)).filter(Boolean).map((m) => drillLabel(m!)).join('・')}</span> は、どれも「{q.token}」を表す語源です。
        </p>
      )}
      {ancestor && (
        <p className="rounded-xl bg-accent-soft p-3 text-sm leading-relaxed">
          どちらも印欧祖語 <span className="font-en font-semibold">{ancestor.label}</span>（{ancestor.meaning.ja}）から生まれた語源です。
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

function Session({ plan, onDone }: { plan: Plan; onDone: () => void }) {
  const dict = useDictionary()
  const retention = useSettings((s) => s.desiredRetention)
  const [items, setItems] = useState<DrillItem[] | null>(null)
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
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

  const item = items?.[i]
  const answer = (k: number) => {
    if (!item || picked !== null) return
    const ok = item.q.choices[k].correct
    navigator.vibrate?.(ok ? 10 : [20, 40, 20])
    setPicked(k)
    setAnswers((a) => [...a, { q: item.q, correct: ok, at: Date.now() }])
    // 間違えた語源は、最後にもう一度（違う種類の問題で。1 回だけ）
    if (!ok && item.role !== 'retry' && items) {
      const again = retryItem(dict, item.q)
      if (again) setItems([...items, again])
    }
  }
  const next = () => {
    setPicked(null)
    setI((n) => n + 1)
  }

  // キーボード: 1〜4 で選ぶ、Enter で次へ
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.repeat || el.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((e.key === 'Enter' || e.key === ' ') && el.closest('button:not(:disabled), a, summary')) return
      if (picked === null) {
        const k = Number(e.key) - 1
        if (k >= 0 && k < item.q.choices.length) answer(k)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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

  const q = item!.q
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1" aria-label={`${i + 1} / ${items.length} 問目`}>
        {items.map((_, k) => (
          <span
            key={k}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              k < answers.length ? (answers[k].correct ? 'bg-success' : 'bg-danger') : k === i ? 'bg-accent' : 'bg-surface-2',
            )}
          />
        ))}
      </div>
      <Card className="flex flex-col items-center gap-4 p-5 text-center">
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
          {KIND_LABEL[q.kind]}
          {item!.role === 'retry' && '・もう一度'}
        </span>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            <h2 className={cn('font-semibold tracking-tight', q.headEn ? 'font-en text-4xl' : 'text-3xl')}>{q.head}</h2>
            {q.word && <SpeakButton text={q.head} />}
          </div>
          {q.sub && <p className="text-sm text-muted">{picked !== null && q.kind === 'family' ? '' : q.sub}</p>}
        </div>
        <p className="text-sm">{q.prompt}</p>
        <div className="grid w-full gap-2">
          {q.choices.map((c, k) => {
            const state = picked === null ? 'idle' : c.correct ? 'correct' : picked === k ? 'wrong' : 'idle'
            return (
              <button
                key={k}
                type="button"
                disabled={picked !== null}
                onClick={() => answer(k)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                  state === 'correct' ? 'border-success bg-success/15' : state === 'wrong' ? 'border-danger bg-danger/10' : 'border-border bg-surface hover:border-accent',
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs">{k + 1}</span>
                <span className={cn('flex-1', c.morph && q.kind !== 'e2m' && 'font-en text-base')}>{c.text}</span>
                {picked !== null && c.morph && q.kind !== 'e2m' && <span className="text-xs text-muted">{dict.morphById.get(c.morph)?.meaning.ja}</span>}
                {state === 'correct' && <Check className="size-4 text-success" />}
                {state === 'wrong' && <X className="size-4 text-danger" />}
              </button>
            )
          })}
        </div>
        {picked !== null && (
          <>
            <Explain item={item!} picked={picked} />
            <Button variant="primary" className="self-end" onClick={next}>
              {i + 1 < items.length ? '次へ' : '結果を見る'} <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}

function Summary({ answers, onDone }: { answers: Answer[]; onDone: () => void }) {
  const dict = useDictionary()
  const by = new Map<string, boolean>()
  for (const a of answers) by.set(a.q.target, (by.get(a.q.target) ?? true) && a.correct)
  const correct = answers.filter((a) => a.correct).length
  return (
    <Card className="flex flex-col items-center gap-4 p-6 text-center">
      <Sparkles className="size-8 text-accent" />
      <h2 className="text-2xl font-semibold">
        {correct} / {answers.length} 問正解
      </h2>
      <p className="max-w-sm text-sm text-muted">語源ごとに次の復習日を決めました。全問できた語源は間をあけて、間違えた語源はすぐにまた出します。</p>
      <ul className="flex w-full max-w-md flex-col gap-1.5 text-left text-sm">
        {[...by].map(([id, ok]) => {
          const m = dict.morphById.get(id)
          if (!m) return null
          return (
            <li key={id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
              {ok ? <Check className="size-4 text-success" /> : <X className="size-4 text-danger" />}
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
        語源（語根・接頭辞・接尾辞）そのものの知識を問うドリルです。すべての語源から、意味・単語の中の語源・似た意味の見分け・同じ祖先などをランダムに出題します。間違えた語源は復習に回ります（単語の「今日の学習」とは別枠）。
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
