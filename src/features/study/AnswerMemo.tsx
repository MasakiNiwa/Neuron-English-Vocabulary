import { Check, NotebookPen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Entry } from '@/features/dictionary/types'
import { matchMeanings, type TypedVerdict } from './answer'
import type { ConcreteFormat } from './formatDefs'

/** このカードでの自分の答え（答え合わせと AI のアドバイスに使う） */
export interface Attempt {
  /** 回答メモ（どの形式でも書ける） */
  memo: string
  /** 使ったヒントの段数 */
  hints?: number
  /** 書いた英語と照合の結果 */
  typed?: { input: string; verdict: TypedVerdict }
  /** 話した英語（聞き取り結果）と発音の点数 */
  spoken?: { heard: string; score: number }
  /** 4 択で選んだ答え */
  choice?: { text: string; correct: boolean }
}

/** 意味（日本語）を答える形式。メモを辞書の訳語と照らし合わせる */
export const MEANING_FORMATS = new Set<ConcreteFormat>(['en2ja', 'listen', 'choice'])

/**
 * 回答メモの入力欄。
 * 意味を答える形式（英→日・聞いて意味）では最初から出し、Enter で答えの確認に進む。
 * ほかの形式では「メモ」を押したときだけ出す（答えの入力欄と紛らわしくならないように）
 */
export function MemoField({
  value,
  onChange,
  onSubmit,
  primary,
}: {
  value: string
  onChange: (v: string) => void
  /** Enter で答えを確認する（意味を答える形式だけ） */
  onSubmit?: () => void
  primary: boolean
}) {
  const [open, setOpen] = useState(primary)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open && !primary) ref.current?.focus()
  }, [open, primary])
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
      >
        <NotebookPen className="size-3.5" /> メモを書く
      </button>
    )
  return (
    <form
      className="w-full max-w-sm"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
    >
      <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-accent">
        <NotebookPen className="size-4 shrink-0 text-muted" />
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="回答メモ"
          placeholder={primary ? '思い浮かんだ意味をメモ（任意）' : 'メモ（任意）'}
          autoComplete="off"
          enterKeyHint={onSubmit ? 'done' : undefined}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </label>
      {onSubmit && <p className="mt-1 hidden text-center text-[11px] text-muted md:block">Enter で答えを確認</p>}
    </form>
  )
}

/** 答えを見たあとの、メモの答え合わせ */
export function MemoResult({ memo, entry, format }: { memo: string; entry: Entry; format: ConcreteFormat }) {
  if (!memo.trim()) return null
  const meanings = entry.g.flatMap((g) => g.ja)
  const hits = MEANING_FORMATS.has(format) ? matchMeanings(memo, meanings) : null
  return (
    <div className="mb-3 w-full rounded-xl border border-border p-2.5 text-left text-sm">
      <div className="flex gap-2">
        <span className="shrink-0 text-[11px] leading-5 text-muted">あなたのメモ</span>
        <span className="min-w-0 break-words">{memo}</span>
      </div>
      {hits &&
        (hits.length ? (
          <p className="mt-1 flex items-start gap-1 text-xs text-success">
            <Check className="mt-0.5 size-3.5 shrink-0" /> 辞書の意味と合っています：{hits.join('、')}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">辞書の意味と同じ言葉は見つかりませんでした（言い換えなら正解のこともあります）</p>
        ))}
    </div>
  )
}
