import { Check, Eye, Lightbulb, Mic, PencilLine, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCardState } from '@/lib/cardState'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { getSpeechRecognition } from '@/lib/speech'
import { useDictionary } from '@/features/dictionary/hooks'
import type { Entry } from '@/features/dictionary/types'
import { buildHints, checkTyped, diffMarks, type TypedVerdict } from './answer'
import { Rating, type Grade } from './cards'
import type { Attempt } from './AnswerMemo'
import { SpeakPrompt, suggestFromScore } from './SpeakPrompt'

type Mode = 'write' | 'speak' | null

/**
 * 英語を答える問題（日→英・穴埋め・聞いて書く）の答え方。
 * 書いて答える / 話して答える / 答えを見る を選べ、ヒントは押したときだけ 1 段ずつ出す。
 * 書いた答え・話した答えは照合して評価を提案するだけで、評価は学習者が押す
 */
/** 英語の答えとして受け付ける文字（全角の英数字は半角に直す。アルファベット・数字・空白・' ’ - . , ! ? だけ） */
export function latinOnly(s: string): string {
  return s.normalize('NFKC').replace(/[^A-Za-z0-9 '’\-.,!?]/g, '')
}

export function ProduceAnswer({
  entry,
  answer,
  targets,
  related = [],
  shown,
  onReveal,
  onSuggest,
  initialMode = null,
  allowSpeak = true,
  onAttempt,
}: {
  entry: Entry
  /** 正解として表示する綴り（穴埋めなら例文中の形） */
  answer: string
  /** 正解とみなす綴り（見出し語・活用形など） */
  targets: string[]
  /** 単語は合っているが形が違う、とみなす綴り（穴埋めの見出し語・ほかの活用形） */
  related?: string[]
  shown: boolean
  onReveal: () => void
  onSuggest: (g: Grade | null) => void
  /** 最初から開いておく答え方（聞いて書くは「書く」） */
  initialMode?: Mode
  allowSpeak?: boolean
  /** 書いた答え・話した答えを親に伝える（AI のアドバイスに使う） */
  onAttempt?: (a: Partial<Attempt>) => void
}) {
  const dict = useDictionary()
  const hints = useMemo(() => buildHints(answer, entry, dict), [answer, entry, dict])
  // ページを移動して戻ってきても、ヒント・答え方・書いた答え・照合の結果をそのままにする
  const [hintLevel, setHintLevel] = useCardState('produce.hint', 0)
  const [mode, setMode] = useCardState<Mode>('produce.mode', initialMode)
  const [typed, setTyped] = useCardState('produce.typed', '')
  const [result, setResult] = useCardState<{ verdict: TypedVerdict; target: string; input: string } | null>('produce.result', null)
  const inputRef = useRef<HTMLInputElement>(null)
  // 日本語入力の変換中は消さない（確定したときに整える）
  const composingRef = useRef(false)
  const [notLatin, setNotLatin] = useState(false)
  const accept = (v: string) => {
    const c = latinOnly(v)
    setNotLatin(c !== v.normalize('NFKC'))
    setTyped(c)
  }
  const canSpeak = allowSpeak && !!getSpeechRecognition()

  useEffect(() => {
    if (mode === 'write') inputRef.current?.focus()
  }, [mode])

  // 使ったヒントの段数も伝える
  useEffect(() => {
    if (hintLevel) onAttempt?.({ hints: hintLevel })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintLevel])

  // ヒントを使って正解したときは「難しい」を提案する
  const withHint = (g: Grade) => (hintLevel > 0 && g === Rating.Good ? Rating.Hard : g)

  const check = () => {
    const r = checkTyped(typed, targets, related)
    setResult({ ...r, input: typed })
    onAttempt?.({ typed: { input: typed, verdict: r.verdict } })
    onSuggest(withHint(r.verdict === 'correct' ? Rating.Good : r.verdict === 'wrong' ? Rating.Again : Rating.Hard))
    navigator.vibrate?.(r.verdict === 'correct' ? 10 : [20, 40, 20])
    onReveal()
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {!shown && hintLevel > 0 && (
        <ul className="w-full max-w-sm space-y-1 rounded-xl bg-surface-2 p-2.5 text-left text-sm">
          {hints.slice(0, hintLevel).map((h) => (
            <li key={h.label} className="flex gap-2">
              <span className="w-24 shrink-0 text-[11px] text-muted">{h.label}</span>
              <span className="font-en tracking-wider">{h.text}</span>
            </li>
          ))}
        </ul>
      )}

      {!shown && mode === 'write' && (
        <form
          className="flex w-full max-w-sm flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            check()
          }}
        >
          <div className="flex gap-2">
            {/* 英語の解答欄: アルファベットだけを受け付ける（訳を書いてしまわないように）。メモ欄とは見た目を分ける */}
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border-2 border-accent/50 bg-surface px-2.5 focus-within:border-accent">
              <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-accent-fg">ABC</span>
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => (composingRef.current ? setTyped(e.target.value) : accept(e.target.value))}
                onCompositionStart={() => (composingRef.current = true)}
                onCompositionEnd={(e) => {
                  composingRef.current = false
                  accept(e.currentTarget.value)
                }}
                aria-label="英語で答える（アルファベット）"
                placeholder="英語（アルファベット）で入力"
                lang="en"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className="font-en h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:font-sans placeholder:text-sm placeholder:text-muted"
              />
            </label>
            <Button type="submit" variant="primary" className="h-11" disabled={!typed.trim()}>
              <Check className="size-4" /> 答え合わせ
            </Button>
          </div>
          {notLatin && <p className="text-left text-[11px] text-warn">英語の答えはアルファベットで入力してください（日本語は消しました。メモは下の欄に書けます）</p>}
        </form>
      )}

      {mode === 'speak' && (
        // 答えを表示したあとも、聞き取った英語と点数を残す（もう一度話すと提案も更新）
        <SpeakPrompt
          target={answer}
          mode="ja2speak"
          onResult={(r) => {
            onAttempt?.({ spoken: { heard: r.heard, score: r.score }, typed: undefined })
            const s = suggestFromScore(r.score)
            onSuggest(withHint(s === 'good' ? Rating.Good : s === 'hard' ? Rating.Hard : Rating.Again))
            navigator.vibrate?.(s === 'again' ? [20, 40, 20] : 10)
            onReveal()
          }}
        />
      )}

      {!shown && (
        <>
          <div className="flex w-full max-w-sm gap-2 [&>button]:flex-1 [&>button]:whitespace-nowrap [&>button]:px-2">
            {mode !== 'write' && (
              <Button onClick={() => setMode('write')} className="h-11">
                <PencilLine className="size-4" /> 書く
              </Button>
            )}
            {canSpeak && mode !== 'speak' && (
              <Button onClick={() => setMode('speak')} className="h-11">
                <Mic className="size-4" /> 話す
              </Button>
            )}
            <Button variant={mode ? 'secondary' : 'primary'} onClick={onReveal} className="h-11">
              <Eye className="size-4" /> 答えを見る
            </Button>
          </div>
          <div className="flex items-center gap-3">
            {hintLevel < hints.length && (
              <button
                type="button"
                onClick={() => setHintLevel((n) => n + 1)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-accent hover:bg-accent-soft"
              >
                <Lightbulb className="size-3.5" /> {hintLevel === 0 ? 'ヒント' : 'もう少しヒント'}（{hintLevel + 1}/{hints.length}）
              </button>
            )}
            {mode !== 'write' && <span className="hidden text-[11px] text-muted md:block">Space で答えを見る</span>}
          </div>
        </>
      )}

      {shown && result && <TypedResult {...result} />}
    </div>
  )
}

/** 書いた答えの答え合わせ（おしいときは違う文字を色分け） */
function TypedResult({ verdict, target, input }: { verdict: TypedVerdict; target: string; input: string }) {
  const marks = diffMarks(input, target)
  return (
    <div
      className={cn(
        'w-full max-w-sm rounded-xl border p-3 text-left text-sm',
        verdict === 'correct' ? 'border-success/40 bg-success/10' : verdict === 'wrong' ? 'border-danger/40 bg-danger/10' : 'border-warn/40 bg-warn/10',
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        {verdict === 'correct' ? <Check className="size-4 text-success" /> : <X className={cn('size-4', verdict === 'wrong' ? 'text-danger' : 'text-warn')} />}
        {verdict === 'correct'
          ? '正解！'
          : verdict === 'form'
            ? `単語は合っています。この文では ${target}`
            : verdict === 'close'
              ? 'おしい！ 綴りが少し違います'
              : 'ちがいます'}
      </div>
      {verdict !== 'correct' && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="text-muted">あなたの答え</dt>
          <dd className="font-en">{input.trim() || '（空欄）'}</dd>
          <dt className="text-muted">正しい綴り</dt>
          <dd className="font-en text-base">
            {verdict === 'close'
              ? marks.map((m, i) => (
                  <span key={i} className={m.ok ? '' : 'rounded bg-warn/30 font-semibold'}>
                    {m.ch}
                  </span>
                ))
              : target}
          </dd>
        </dl>
      )}
      <p className="mt-1 text-[11px] text-muted">評価の目安を提案しています。最後は自分で評価を選んでください。</p>
    </div>
  )
}
