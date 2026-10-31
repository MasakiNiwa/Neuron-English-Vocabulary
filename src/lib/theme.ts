import { useEffect, useSyncExternalStore } from 'react'
import { useSettings } from '@/stores/settings'
import { withViewTransition } from './viewTransition'

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function subscribe(cb: () => void) {
  media?.addEventListener('change', cb)
  return () => media?.removeEventListener('change', cb)
}

export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribe, () => media?.matches ?? false, () => false)
}

/** 実際に適用されているテーマ */
export function useResolvedTheme(): 'light' | 'dark' {
  const mode = useSettings((s) => s.theme)
  const systemDark = useSystemDark()
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
}

/** <html data-theme> に反映するフック（ルートで1回だけ使う） */
export function useApplyTheme() {
  const resolved = useResolvedTheme()
  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color))
  }, [resolved])
}

export function toggleTheme(current: 'light' | 'dark') {
  withViewTransition(() => useSettings.getState().set('theme', current === 'dark' ? 'light' : 'dark'))
}
