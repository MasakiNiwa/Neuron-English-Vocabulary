import { flushSync } from 'react-dom'
import { reduceMotion } from './motion'

/** View Transitions API で状態変更を包む（未対応ブラウザやモーション軽減時はそのまま実行） */
export function withViewTransition(update: () => void) {
  if (!document.startViewTransition || reduceMotion()) {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}
