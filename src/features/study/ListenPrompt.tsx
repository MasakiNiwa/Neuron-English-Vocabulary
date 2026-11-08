import { Snail, Volume2 } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { speak, stopSpeaking } from '@/lib/speech'

/**
 * 聞いて答える出題（聞いて意味・聞いて書く）の問題文。文字は見せず、発音だけを流す。
 * カードが出たら 1 回自動で流し、何度でも聞き直せる（ゆっくりも）
 */
export function ListenPrompt({ text, hint }: { text: string; hint: string }) {
  useEffect(() => {
    // 前のカードの読み上げや画面の切り替えと重ならないよう、少し待ってから流す
    const t = setTimeout(() => speak(text), 300)
    return () => {
      clearTimeout(t)
      // 次の問題に進んだら、前の問題の読み上げはすぐに止める
      stopSpeaking()
    }
  }, [text])
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => speak(text)}
        aria-label="もう一度聞く"
        className="flex size-20 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm transition-transform hover:opacity-90 active:scale-95"
      >
        <Volume2 className="size-9" />
      </button>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => speak(text)}>
          <Volume2 className="size-4" /> もう一度
        </Button>
        <Button size="sm" onClick={() => speak(text, { rate: 0.6 })}>
          <Snail className="size-4" /> ゆっくり
        </Button>
      </div>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  )
}
