import { useRouterState } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * スクロール位置の復元。
 *  - 戻る / 進む（popstate）で戻ってきたページは、離れたときの位置に戻す
 *  - リンクで新しく開いたページは先頭から表示
 * ページは遅延読み込みなので、内容の高さが確保されるまで少し待ってから復元する。
 */
const positions = new Map<string, number>()
let popped = false
if (typeof window !== 'undefined') window.addEventListener('popstate', () => (popped = true))

export function ScrollRestorer() {
  const href = useRouterState({ select: (s) => s.location.href })
  const prev = useRef(href)

  useEffect(() => {
    const onScroll = () => positions.set(prev.current, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    if (prev.current === href) return
    prev.current = href
    const target = popped ? (positions.get(href) ?? 0) : 0
    popped = false
    let tries = 0
    const tick = () => {
      window.scrollTo(0, target)
      if (Math.abs(window.scrollY - target) > 2 && tries++ < 60) requestAnimationFrame(tick)
    }
    tick()
  }, [href])

  return null
}
