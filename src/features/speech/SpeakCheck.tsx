import { Mic, RotateCcw, Square, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { grade, type PronounceResult, type WordResult } from '@/lib/pronounce'
import { speak } from '@/lib/speech'
import { speechRecognitionSupported, useSpeechCheck, type CheckState } from './useSpeechCheck'

const GRADE_VIEW = {
  perfect: { label: '完璧！', cls: 'bg-success/15 text-success' },
  good: { label: 'いいね', cls: 'bg-success/10 text-success' },
  close: { label: 'おしい', cls: 'bg-warn/15 text-warn' },
  retry: { label: 'もう一度', cls: 'bg-danger/10 text-danger' },
} as const

/** お手本を単語ごとに色分けして表示（言えた・おしい・言えていない） */
export function WordMarks({ words, className }: { words: WordResult[]; className?: string }) {
  return (
    <p className={cn('font-en leading-relaxed', className)}>
      {words.map((w, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <span
            className={cn(
              'rounded px-0.5',
              w.status === 'ok' && 'text-success',
              w.status === 'close' && 'bg-warn/15 text-warn underline decoration-dotted underline-offset-4',
              w.status === 'miss' && 'bg-danger/10 text-danger underline decoration-wavy underline-offset-4',
            )}
            title={w.status === 'ok' ? '言えています' : w.heard ? `「${w.heard}」に聞こえました` : '聞き取れませんでした'}
          >
            {w.word}
          </span>
        </span>
      ))}
    </p>
  )
}

/** 採点結果の表示（点数・色分け・聞き取った英語） */
export function ResultView({ result, target, onRetry, compact }: { result: PronounceResult; target: string; onRetry: () => void; compact?: boolean }) {
  const g = GRADE_VIEW[grade(result.score)]
  const off = result.words.filter((w) => w.status !== 'ok' && w.heard)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-0.5 text-sm font-semibold', g.cls)}>
          {g.label} <span className="tabular-nums">{result.score}</span>
        </span>
        <div className="flex-1" />
        <IconButton label="お手本を聞く" onClick={() => speak(target)}>
          <Volume2 className="size-4" />
        </IconButton>
        <IconButton label="もう一度" onClick={onRetry}>
          <RotateCcw className="size-4" />
        </IconButton>
      </div>
      <WordMarks words={result.words} className={compact ? 'text-base' : 'text-lg'} />
      <p className="text-xs text-muted">
        聞き取った英語: <span className="font-en text-fg">{result.heard ? `“${result.heard}”` : '（なし）'}</span>
      </p>
      {off.length > 0 && (
        <ul className="text-xs text-muted">
          {off.slice(0, 3).map((w, i) => (
            <li key={i}>
              <span className="font-en font-medium text-fg">{w.word}</span> が <span className="font-en">{w.heard}</span> に聞こえました
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-accent"
    >
      {children}
    </button>
  )
}

/** マイクのボタン（聞き取り中は脈打つ輪と停止ボタンになる） */
export function MicButton({ state, onStart, onStop, size = 'md', label }: { state: CheckState; onStart: () => void; onStop: () => void; size?: 'md' | 'lg'; label?: string }) {
  const listening = state.phase === 'listening'
  const big = size === 'lg'
  return (
    <button
      type="button"
      onClick={listening ? onStop : onStart}
      aria-label={listening ? '話し終えた' : (label ?? '発音してみる')}
      className={cn(
        'relative inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors',
        big ? 'h-14 px-6 text-base' : 'h-9 px-3.5 text-sm',
        // 聞き取り中は控えめに脈打つ輪で示す（大きく広がる動きは目障りなので使わない）
        listening ? 'animate-pulse bg-accent text-accent-fg ring-4 ring-accent/25' : 'border border-accent/50 bg-accent-soft text-accent hover:bg-accent/15',
      )}
    >
      {listening ? <Square className={big ? 'size-4 fill-current' : 'size-3 fill-current'} /> : <Mic className={big ? 'size-5' : 'size-4'} />}
      <span className="relative">{listening ? '話し終えた' : (label ?? '発音してみる')}</span>
    </button>
  )
}

/** 聞き取り中の表示（話しながら認識結果が出る） */
export function ListeningView({ state }: { state: CheckState }) {
  if (state.phase === 'listening')
    return (
      <p className="min-h-6 text-sm text-muted" aria-live="polite">
        {state.interim ? <span className="font-en italic text-fg">{state.interim}</span> : '聞き取り中… 英語で話してください'}
      </p>
    )
  if (state.phase === 'error')
    return (
      <p className="text-sm text-danger" role="alert">
        {state.message}
      </p>
    )
  return null
}

/**
 * 発音チェック（単語ページの見出し語・例文用）。
 * ボタンを押して話すと、お手本と比べて単語ごとに色分けし、点数と聞き取った英語を表示する。
 * 音声認識に対応していないブラウザでは何も表示しない
 */
export function SpeakCheck({ target, compact, autoStart }: { target: string; compact?: boolean; autoStart?: boolean }) {
  const { state, start, stop } = useSpeechCheck(target)
  const started = useRef(false)
  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true
      start()
    }
  }, [autoStart, start])
  if (!speechRecognitionSupported()) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <MicButton state={state} onStart={start} onStop={stop} />
        {state.phase === 'idle' && <span className="text-xs text-muted">ボタンを押して英語で読み上げると、聞き取れたかを確認できます</span>}
      </div>
      <ListeningView state={state} />
      {state.phase === 'done' && <ResultView result={state.result} target={target} onRetry={start} compact={compact} />}
    </div>
  )
}

/**
 * 例文の行。右端の小さなマイクを押すと、その場（行の下）に発音チェックを開いてすぐ聞き取りを始める。
 * children は例文本文、actions は読み上げボタンなど
 */
export function SpeakableRow({ target, children, actions }: { target: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const { state, start, stop, reset } = useSpeechCheck(target)
  const supported = speechRecognitionSupported()
  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <div className="flex shrink-0 items-center">
          {actions}
          {supported && (
            <button
              type="button"
              onClick={() => {
                if (state.phase === 'listening') stop()
                else if (!open) {
                  setOpen(true)
                  start()
                } else {
                  setOpen(false)
                  reset()
                }
              }}
              aria-label={state.phase === 'listening' ? '話し終えた' : 'この文を発音してみる'}
              title="この文を発音してみる"
              aria-expanded={open}
              className={cn(
                'relative inline-flex size-7 items-center justify-center rounded-full hover:bg-surface-2 hover:text-accent',
                state.phase === 'listening' ? 'animate-pulse bg-accent text-accent-fg ring-4 ring-accent/25 hover:bg-accent hover:text-accent-fg' : open ? 'text-accent' : 'text-muted',
              )}
            >
              {state.phase === 'listening' ? <Square className="relative size-3 fill-current" /> : <Mic className="size-4" />}
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-2 border-t border-border pt-2">
          <ListeningView state={state} />
          {state.phase === 'done' && <ResultView result={state.result} target={target} onRetry={start} compact />}
          {state.phase === 'error' && (
            <button type="button" onClick={start} className="mt-1 text-xs text-accent">
              もう一度
            </button>
          )}
        </div>
      )}
    </div>
  )
}
