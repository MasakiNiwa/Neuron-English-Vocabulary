import { useEffect } from 'react'
import { useSettings } from '@/stores/settings'

/**
 * 「モーションを減らす」の判定を 1 か所にまとめる（アプリの設定 または OS の設定。ROADMAP B15）。
 * CSS のアニメーションは <html data-reduce-motion> で、JS のアニメーション・スクロールはこの関数で止める。
 */
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

export function reduceMotion(): boolean {
  return useSettings.getState().reduceMotion || !!media?.matches
}

/** スムーズスクロールの指定（モーションを減らすときは瞬時に） */
export const scrollBehavior = (): ScrollBehavior => (reduceMotion() ? 'auto' : 'smooth')

/** <html data-reduce-motion> に反映するフック（ルートで 1 回だけ使う） */
export function useApplyMotion() {
  const setting = useSettings((s) => s.reduceMotion)
  useEffect(() => {
    const apply = () => {
      if (reduceMotion()) document.documentElement.dataset.reduceMotion = ''
      else delete document.documentElement.dataset.reduceMotion
    }
    apply()
    media?.addEventListener('change', apply)
    return () => media?.removeEventListener('change', apply)
  }, [setting])
}
