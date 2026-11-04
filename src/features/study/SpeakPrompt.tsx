import { grade, type PronounceResult } from '@/lib/pronounce'
import { ListeningView, MicButton, ResultView } from '@/features/speech/SpeakCheck'
import { useSpeechCheck } from '@/features/speech/useSpeechCheck'

/**
 * 発音で答える出題（英語を見て発音する / 日本語を見て英語で言う）。
 * 話し終えると採点し、onResult で親に伝える（親は答えを表示し、評価を提案する）。
 * もう一度話すと結果が更新される
 */
export function SpeakPrompt({ target, mode, onResult }: { target: string; mode: 'speak' | 'ja2speak'; onResult: (r: PronounceResult) => void }) {
  const { state, start, stop } = useSpeechCheck(target, onResult)
  return (
    <div className="flex w-full flex-col items-center gap-3">
      {state.phase !== 'done' && (
        <>
          <MicButton state={state} onStart={start} onStop={stop} size="lg" label={mode === 'speak' ? '発音する' : '英語で答える'} />
          {state.phase === 'idle' && (
            <p className="text-xs text-muted">{mode === 'speak' ? 'ボタンを押して、この英語を発音してください' : 'ボタンを押して、この意味の英語を言ってください'}</p>
          )}
          <ListeningView state={state} />
        </>
      )}
      {state.phase === 'done' && (
        <div className="w-full rounded-xl border border-border p-3 text-left">
          <ResultView result={state.result} target={target} onRetry={start} compact />
        </div>
      )}
    </div>
  )
}

/** 発音の点数から、評価ボタンの提案を決める */
export function suggestFromScore(score: number): 'again' | 'hard' | 'good' {
  const g = grade(score)
  return g === 'retry' ? 'again' : g === 'close' ? 'hard' : 'good'
}
