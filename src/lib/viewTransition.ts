import { flushSync } from 'react-dom'
import { useSettings } from '@/stores/settings'

/** View Transitions API で状態変更を包む（未対応ブラウザやモーション軽減時はそのまま実行） */
export function withViewTransition(update: () => void) {
  const reduce =
    useSettings.getState().reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduce) {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}
