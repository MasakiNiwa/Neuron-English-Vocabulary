import { Check, Eye, Lightbulb, Mic, PencilLine, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { getSpeechRecognition } from '@/lib/speech'
import { useDictionary } from '@/features/dictionary/hooks'
import type { Entry } from '@/features/dictionary/types'
import { buildHints, checkTyped, diffMarks, type TypedVerdict } from './answer'
import { Rating, type Grade } from './cards'
import { SpeakPrompt, suggestFromScore } from './SpeakPrompt'

type Mode = 'write' | 'speak' | null

/**
 * 英語を答える問題（日→英・穴埋め・聞いて書く）の答え方。
 * 書いて答える / 話して答える / 答えを見る を選べ、ヒントは押したときだけ 1 段ずつ出す。
 * 書いた答え・話した答えは照合して評価を提案するだけで、評価は学習者が押す
 */
export function ProduceAnswer({
  entry,
  answer,
  targets,
  shown,
  onReveal,
  onSuggest,
  initialMode = null,
  allowSpeak = true,
}: {
  entry: Entry
  /** 正解として表示する綴り（穴埋めなら例文中の形） */
  answer: string
  /** 正解とみなす綴り（見出し語・活用形など） */
  targets: string[]
  shown: boolean
  onReveal: () => void
  onSuggest: (g: Grade | null) => void
  /** 最初から開いておく答え方（聞いて書くは「書く」） */
  initialMode?: Mode
  allowSpeak?: boolean
}) {
  const dict = useDictionary()
  const hints = useMemo(() => buildHints(answer, entry, dict), [answer, entry, dict])
  const [hintLevel, setHintLevel] = useState(0)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<{ verdict: TypedVerdict; target: string; input: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const canSpeak = allowSpeak && !!getSpeechRecognition()

  useEffect(() => {
    if (mode === 'write') inputRef.current?.focus()
  }, [mode])

  // ヒントを使って正解したときは「難しい」を提案する
  const withHint = (g: Grade) => (hintLevel > 0 && g === Rating.Good ? Rating.Hard : g)

  const check = () => {
    const r = checkTyped(typed, targets)
    setResult({ ...r, input: typed })
    onSuggest(withHint(r.verdict === 'correct' ? Rating.Good : r.verdict === 'close' ? Rating.Hard : Rating.Again))
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
          className="flex w-full max-w-sm gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            check()
          }}
        >
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="英語で答える"
            placeholder="英語で入力"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="font-en h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          />
          <Button type="submit" variant="primary" className="h-11">
            <Check className="size-4" /> 答え合わせ
          </Button>
        </form>
      )}

      {!shown && mode === 'speak' && (
        <SpeakPrompt
          target={answer}
          mode="ja2speak"
          onResult={(r) => {
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
        verdict === 'correct' ? 'border-success/40 bg-success/10' : verdict === 'close' ? 'border-warn/40 bg-warn/10' : 'border-danger/40 bg-danger/10',
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        {verdict === 'correct' ? <Check className="size-4 text-success" /> : <X className={cn('size-4', verdict === 'close' ? 'text-warn' : 'text-danger')} />}
        {verdict === 'correct' ? '正解！' : verdict === 'close' ? 'おしい！ 綴りが少し違います' : 'ちがいます'}
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
