import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, BookOpen, BookOpenCheck, Check, GraduationCap, RotateCcw, Sparkles, Star, X } from 'lucide-react'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { db } from '@/lib/db'
import { EntryLink, LinkedText, morphLabel, SpeakButton } from '@/features/dictionary/components/links'
import { getEntries } from '@/features/dictionary/data'
import { useDictionary } from '@/features/dictionary/hooks'
import type { Entry, IndexEntry, Morpheme } from '@/features/dictionary/types'
import { addManyToStudy } from '@/features/study/cards'
import { lessonChoices, lessonRoots, lessonWords, stars, type Choice } from './lessons'

/** 部品の並び（語根を強調し、各部品の意味を下に出す） */
function PartsView({ entry, rootId }: { entry: Entry; rootId: string }) {
  const dict = useDictionary()
  if (!entry.parts?.length) return null
  return (
    <div className="flex flex-wrap items-stretch justify-center gap-1.5">
      {entry.parts.map((p, i) => {
        const m = p.m && !p.m.startsWith('w:') ? dict.morphById.get(p.m) : null
        const w = p.m?.startsWith('w:') ? dict.byKey.get(p.m.slice(2).replace(/ /g, '_')) : null
        const meaning = m?.meaning.ja ?? w?.gloss.split('、')[0]
        const isRoot = p.m === rootId
        return (
          <div key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted">+</span>}
            <div
              className={cn(
                'flex min-w-14 flex-col items-center rounded-xl px-2.5 py-1.5',
                isRoot ? 'bg-accent-soft ring-2 ring-accent/40' : meaning ? 'border border-border' : '',
              )}
            >
              <span className={cn('font-en text-lg', isRoot && 'font-semibold text-accent')}>{p.s}</span>
              {meaning && <span className="max-w-28 text-center text-[11px] leading-tight text-muted">{meaning}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

type Step = { kind: 'intro' } | { kind: 'question'; i: number; answered: number | null } | { kind: 'summary' }

function Lesson({ root }: { root: Morpheme }) {
  const dict = useDictionary()
  const navigate = useNavigate()
  const words = useMemo(() => lessonWords(dict, root), [dict, root])
  const [entries, setEntries] = useState<Map<string, Entry> | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'intro' })
  const [results, setResults] = useState<boolean[]>([])
  const [added, setAdded] = useState<number | null>(null)
  const record = useLiveQuery(() => db.rootLessons.get(root.id), [root.id])

  useEffect(() => {
    setStep({ kind: 'intro' })
    setResults([])
    setAdded(null)
    void getEntries(words.map((w) => w.key)).then((es) => setEntries(new Map(es.map((e) => [e.k, e]))))
  }, [words])

  // 選択肢は問題ごとに 1 回だけ作る（再描画で並びが変わらないように）
  const choices = useMemo(
    () => words.map((w) => lessonChoices(w, entries?.get(w.key) ?? null, words, dict.entries)),
    [words, entries, dict],
  )

  const answer = (i: number, k: number) => {
    if (step.kind !== 'question' || step.answered !== null) return
    const ok = choices[i][k].correct
    navigator.vibrate?.(ok ? 10 : [20, 40, 20])
    setResults((r) => [...r, ok])
    setStep({ kind: 'question', i, answered: k })
  }

  const next = async () => {
    if (step.kind !== 'question') return
    if (step.i + 1 < words.length) {
      setStep({ kind: 'question', i: step.i + 1, answered: null })
      return
    }
    // レッスン完了: 図鑑に記録する
    const correct = results.filter(Boolean).length
    const prev = await db.rootLessons.get(root.id)
    await db.rootLessons.put({
      id: root.id,
      completedAt: Date.now(),
      correct,
      total: words.length,
      best: Math.max(prev?.best ?? 0, correct),
      plays: (prev?.plays ?? 0) + 1,
    })
    setStep({ kind: 'summary' })
  }

  // キーボード: 1〜4 で選ぶ、Enter で次へ
  useEffect(() => {
    if (step.kind !== 'question') return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.repeat || el.closest('input, textarea, select, [contenteditable="true"]')) return
      // Enter・Space はフォーカスしているボタン・リンクの操作を優先する（レビュー 2026-11-07 の 05）
      if ((e.key === 'Enter' || e.key === ' ') && el.closest('button:not(:disabled), a, summary')) return
      if (step.answered === null) {
        const k = Number(e.key) - 1
        if (k >= 0 && k < choices[step.i].length) answer(step.i, k)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        void next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!entries) return <PageSpinner />

  if (step.kind === 'intro')
    return (
      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">語根レッスン</span>
        <h1 className="font-en text-5xl font-semibold text-accent">{morphLabel(root)}</h1>
        <p className="text-xl">{root.meaning.ja}</p>
        <p className="text-sm text-muted">
          {root.origin}
          {root.forms.length > 1 && <span className="font-en"> ・ {root.forms.join(', ')}</span>}
        </p>
        {root.desc?.ja && <p className="max-w-md text-sm leading-relaxed text-muted">{root.desc.ja}</p>}
        <p className="mt-2 max-w-md text-sm leading-relaxed">
          この語根を使う <strong>{words.length} 語</strong>を、部品の意味から当てていきます。知らない単語でも、部品から意味を推測できるか試してみましょう。
        </p>
        {record && (
          <p className="text-xs text-muted">
            前回 {record.correct} / {record.total}・最高 {record.best}・{record.plays} 回目の挑戦
          </p>
        )}
        <Button variant="primary" size="lg" className="mt-2 w-full max-w-xs" onClick={() => setStep({ kind: 'question', i: 0, answered: null })}>
          <Sparkles className="size-5" /> はじめる
        </Button>
      </Card>
    )

  if (step.kind === 'summary') {
    const correct = results.filter(Boolean).length
    const s = stars(correct, words.length)
    const roots = lessonRoots(dict)
    return <Summary root={root} words={words} results={results} correct={correct} s={s} added={added} onAdd={async () => setAdded(await addManyToStudy(words.map((w) => w.key)))} onRetry={() => {
      setResults([])
      setStep({ kind: 'question', i: 0, answered: null })
    }} onNext={async () => {
      const done = new Set((await db.rootLessons.toArray()).map((r) => r.id))
      const nextRoot = roots.find((m) => !done.has(m.id) && m.id !== root.id)
      if (nextRoot) void navigate({ to: '/lesson/$id', params: { id: nextRoot.id } })
    }} />
  }

  const w = words[step.i]
  const e = entries.get(w.key)
  const opts: Choice[] = choices[step.i]
  return (
    <div className="flex flex-col gap-3">
      {/* 進み具合 */}
      <div className="flex items-center gap-1.5" aria-label={`${step.i + 1} / ${words.length} 問目`}>
        {words.map((_, k) => (
          <span
            key={k}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              k < results.length ? (results[k] ? 'bg-success' : 'bg-danger') : k === step.i ? 'bg-accent' : 'bg-surface-2',
            )}
          />
        ))}
      </div>
      <Card className="flex flex-col items-center gap-4 p-5 text-center">
        <div className="flex items-center gap-1">
          <h2 className="font-en text-4xl font-semibold tracking-tight">{w.key.replace(/_/g, ' ')}</h2>
          <SpeakButton text={w.key.replace(/_/g, ' ')} />
        </div>
        {e && <PartsView entry={e} rootId={root.id} />}
        <p className="text-sm text-muted">部品の意味から、この単語の意味を当ててみよう</p>
        <div className="grid w-full gap-2">
          {opts.map((o, k) => {
            const state = step.answered === null ? 'idle' : o.correct ? 'correct' : step.answered === k ? 'wrong' : 'idle'
            return (
              <button
                key={k}
                type="button"
                disabled={step.answered !== null}
                onClick={() => answer(step.i, k)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                  state === 'correct' ? 'border-success bg-success/15' : state === 'wrong' ? 'border-danger bg-danger/10' : 'border-border bg-surface hover:border-accent',
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs">{k + 1}</span>
                <span className="flex-1">{o.text}</span>
                {state === 'correct' && <Check className="size-4 text-success" />}
                {state === 'wrong' && <X className="size-4 text-danger" />}
              </button>
            )
          })}
        </div>
        {step.answered !== null && (
          <div className="flex w-full flex-col gap-3 text-left">
            <p className={cn('text-center text-sm font-medium', opts[step.answered].correct ? 'text-success' : 'text-danger')}>
              {opts[step.answered].correct ? '正解！' : `正解は「${w.gloss}」`}
            </p>
            {e?.note?.ja && (
              <p className="rounded-xl bg-surface-2 p-3 text-sm leading-relaxed">
                <LinkedText text={e.note.ja} />
              </p>
            )}
            <div className="flex items-center justify-between">
              <EntryLink k={w.key} className="text-xs">
                単語ページで詳しく見る
              </EntryLink>
              <Button variant="primary" onClick={() => void next()}>
                {step.i + 1 < words.length ? '次へ' : '結果を見る'} <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function StarRow({ n, size = 'md' }: { n: number; size?: 'sm' | 'md' }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`星 ${n} つ`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} className={cn(size === 'sm' ? 'size-3.5' : 'size-7', i < n ? 'fill-warn text-warn' : 'text-border')} />
      ))}
    </span>
  )
}
export { StarRow }

function Summary({
  root,
  words,
  results,
  correct,
  s,
  added,
  onAdd,
  onRetry,
  onNext,
}: {
  root: Morpheme
  words: IndexEntry[]
  results: boolean[]
  correct: number
  s: number
  added: number | null
  onAdd: () => void
  onRetry: () => void
  onNext: () => void
}) {
  return (
    <Card className="flex flex-col items-center gap-3 p-6 text-center">
      <StarRow n={s} />
      <p className="text-sm text-muted">語根図鑑に登録しました</p>
      <h1 className="font-en text-4xl font-semibold text-accent">{morphLabel(root)}</h1>
      <p>{root.meaning.ja}</p>
      <p className="text-lg font-semibold">
        {correct} / {words.length} 問 正解
      </p>
      <ul className="w-full divide-y divide-border rounded-xl border border-border text-left">
        {words.map((w, i) => (
          <li key={w.key} className="flex items-center gap-2 px-3 py-2 text-sm">
            {results[i] ? <Check className="size-4 shrink-0 text-success" /> : <X className="size-4 shrink-0 text-danger" />}
            <EntryLink k={w.key} className="font-en w-32 shrink-0 truncate" />
            <span className="min-w-0 flex-1 truncate text-muted">{w.gloss}</span>
          </li>
        ))}
      </ul>
      {root.story && (
        <div className="w-full rounded-xl bg-accent-soft p-3 text-left text-sm leading-relaxed">
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-accent">
            <BookOpen className="size-3.5" /> 語根の物語
          </div>
          {root.story.ja}
        </div>
      )}
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Button className="w-full sm:flex-1" onClick={onAdd} disabled={added !== null}>
          <GraduationCap className="size-4" /> {added === null ? `${words.length} 語を学習カードに追加` : `追加しました（+${added}）`}
        </Button>
        <Button className="w-full sm:flex-1" onClick={onRetry}>
          <RotateCcw className="size-4" /> もう一度
        </Button>
      </div>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Button variant="primary" className="w-full sm:flex-1" onClick={onNext}>
          次の語根へ <ArrowRight className="size-4" />
        </Button>
        <Link to="/roots" className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-border text-sm hover:bg-surface-2">
          <BookOpenCheck className="size-4" /> 語根図鑑を見る
        </Link>
      </div>
    </Card>
  )
}

function LessonInner() {
  const { id } = useParams({ from: '/lesson/$id' })
  const dict = useDictionary()
  const root = dict.morphById.get(id)
  if (!root || root.type !== 'root') return <p className="text-muted">この語根のレッスンはありません。</p>
  return <Lesson key={root.id} root={root} />
}

export function LessonPage() {
  return (
    <Page>
      <div className="mx-auto max-w-xl">
        <Suspense fallback={<PageSpinner />}>
          <LessonInner />
        </Suspense>
      </div>
    </Page>
  )
}
