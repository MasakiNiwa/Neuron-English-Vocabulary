import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { SpeakButton } from '@/features/dictionary/components/links'
import { useDictionary } from '@/features/dictionary/hooks'
import type { Entry } from '@/features/dictionary/types'
import { buildChoices } from './choices'

/**
 * 出題形式
 *  en2ja: 英語 → 意味を思い出す
 *  ja2en: 意味 → 英語を思い出す
 *  cloze: 例文の穴埋め
 *  choice: 4 択（意味を選ぶ）
 *  mix: 上記をランダムに
 */
export type StudyFormat = 'en2ja' | 'ja2en' | 'cloze' | 'choice' | 'mix'
export type ConcreteFormat = Exclude<StudyFormat, 'mix'>

export const FORMAT_OPTIONS: { value: StudyFormat; label: string }[] = [
  { value: 'en2ja', label: '英→日' },
  { value: 'ja2en', label: '日→英' },
  { value: 'cloze', label: '穴埋め' },
  { value: 'choice', label: '4択' },
  { value: 'mix', label: 'ミックス' },
]

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

export function resolveFormat(format: StudyFormat, entry: Entry | null): ConcreteFormat {
  if (!entry) return 'en2ja'
  const available: ConcreteFormat[] = ['en2ja', 'ja2en', 'choice']
  if (findCloze(entry)) available.push('cloze')
  if (format === 'mix') return available[Math.floor(Math.random() * available.length)]
  return available.includes(format) ? format : 'en2ja'
}

export function JaPrompt({ entry }: { entry: Entry }) {
  const hint = entry.h
    .split('')
    .map((c, i) => (i === 0 || c === ' ' ? c : '＿'))
    .join('')
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-col gap-1 text-lg">
        {entry.g.map((g, i) => (
          <div key={i}>{g.ja.slice(0, 4).join('、')}</div>
        ))}
      </div>
      <div className="font-en text-xl tracking-[0.3em] text-muted">{hint}</div>
      <p className="text-xs text-muted">この意味の英語を思い浮かべてください</p>
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
          <span className="inline-block min-w-16 border-b-2 border-accent px-1 text-muted">{word[0]}…</span>
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
  onAnswer: (index: number, correct: boolean) => void
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
        onAnswer(i, options[i].correct)
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
            onClick={() => onAnswer(i, o.correct)}
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
