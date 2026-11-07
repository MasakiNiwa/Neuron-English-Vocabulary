import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { SpeakButton } from '@/features/dictionary/components/links'
import { useDictionary } from '@/features/dictionary/hooks'
import type { Entry } from '@/features/dictionary/types'
import { buildChoices } from './choices'
import { getSpeechRecognition, ttsSupported } from '@/lib/speech'

export * from './formatDefs'
import { PRODUCTION, RECOGNITION, type ConcreteFormat } from './formatDefs'

/** 例文中で見出し語（またはその活用形）が出てくる位置 */
export function findCloze(entry: Entry) {
  const forms = [entry.h, ...(entry.forms ?? [])].map((f) => f.toLowerCase()).sort((a, b) => b.length - a.length)
  for (const ex of entry.ex ?? []) {
    const lower = ex.en.toLowerCase()
    for (const f of forms) {
      // 熟語は空白とハイフンを同じものとして探す（state of the art → state-of-the-art）
      const pat = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ -]')
      const re = new RegExp(`(^|[^a-z])(${pat})(?![a-z])`, 'i')
      const m = re.exec(lower)
      if (m) {
        const start = m.index + m[1].length
        return { ex, start, end: start + m[2].length }
      }
    }
  }
  return null
}

/** この端末で使える形式か（読み上げ・音声認識の対応） */
export function formatSupported(f: ConcreteFormat): boolean {
  if (f === 'speak') return !!getSpeechRecognition()
  if (f === 'listen' || f === 'dictation') return ttsSupported
  return true
}

/**
 * 1 枚のカードの出題形式を選ぶ。選んだ形式のうち、その語で出せるもの（穴埋めは例文があるとき）から選ぶ。
 * おまかせ（auto）では、新しい・覚えかけの語（安定度 7 日未満）は意味を答える形式を、覚えてきた語は英語を答える形式を 8 割で選ぶ
 */
export function pickFormat(
  selected: ConcreteFormat[],
  auto: boolean,
  entry: Entry | null,
  card: { state: number; stability: number } | null,
  random: () => number = Math.random,
): ConcreteFormat {
  if (!entry) return 'en2ja'
  const ok = selected.filter((f) => formatSupported(f) && (f !== 'cloze' || !!findCloze(entry)))
  if (!ok.length) return 'en2ja'
  let pool = ok
  if (auto && ok.length > 1 && card) {
    const learning = card.state !== 2 || card.stability < 7
    const prefer = (random() < 0.8) === learning ? RECOGNITION : PRODUCTION
    const p = ok.filter((f) => prefer.includes(f))
    if (p.length) pool = p
  }
  return pool[Math.floor(random() * pool.length)]
}

/** 日→英の問題文（意味だけ。頭文字・文字数のヒントは「ヒント」を押したときに出す） */
export function JaPrompt({ entry }: { entry: Entry }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-col gap-1 text-lg">
        {entry.g.map((g, i) => (
          <div key={i}>{g.ja.slice(0, 4).join('、')}</div>
        ))}
      </div>
      <p className="text-xs text-muted">この意味の英語は？</p>
    </div>
  )
}

export function ClozePrompt({ entry, revealed }: { entry: Entry; revealed: boolean }) {
  const c = findCloze(entry)
  if (!c) return null
  const word = c.ex.en.slice(c.start, c.end)
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="font-en text-xl leading-relaxed">
        {c.ex.en.slice(0, c.start)}
        {revealed ? (
          <span className="rounded bg-accent-soft px-1 font-semibold text-accent">{word}</span>
        ) : (
          <span className="inline-block min-w-16 border-b-2 border-accent px-1 text-muted">&nbsp;</span>
        )}
        {c.ex.en.slice(c.end)}
      </p>
      <p className="text-sm text-muted">{c.ex.ja}</p>
      {revealed && <SpeakButton text={c.ex.en} size="sm" />}
    </div>
  )
}

/** 4 択: 正解 + 頻度が近い別の語の訳 3 つ（数字キーでも選べる） */
export function ChoicePrompt({
  entry,
  onAnswer,
  answered,
}: {
  entry: Entry
  answered: number | null
  /** text: 選んだ選択肢の文（AI のアドバイスに使う） */
  onAnswer: (index: number, correct: boolean, text: string) => void
}) {
  const dict = useDictionary()
  const options = useMemo(() => buildChoices(entry, dict.entries), [dict, entry])
  // 数字キー 1〜4 で選べる（B15）
  useEffect(() => {
    if (answered !== null) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return
      const i = Number(e.key) - 1
      if (Number.isInteger(i) && i >= 0 && i < options.length) {
        e.preventDefault()
        e.stopImmediatePropagation()
        onAnswer(i, options[i].correct, options[i].text)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [answered, options, onAnswer])
  return (
    <div className="grid w-full gap-2">
      {options.map((o, i) => {
        const state = answered === null ? 'idle' : o.correct ? 'correct' : answered === i ? 'wrong' : 'idle'
        return (
          <button
            key={i}
            type="button"
            disabled={answered !== null}
            onClick={() => onAnswer(i, o.correct, o.text)}
            className={
              'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ' +
              (state === 'correct'
                ? 'border-success bg-success/15'
                : state === 'wrong'
                  ? 'border-danger bg-danger/10'
                  : 'border-border bg-surface hover:border-accent')
            }
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs">{i + 1}</span>
            <span className="flex-1">{o.text}</span>
            {state === 'correct' && <Check className="size-4 text-success" />}
            {state === 'wrong' && <X className="size-4 text-danger" />}
          </button>
        )
      })}
    </div>
  )
}

export function useChoiceState() {
  return useState<number | null>(null)
}
