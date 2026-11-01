import type { NavItem } from './nav'

/**
 * ナビの各タブが「最後に見ていたページ」を覚える（スマホアプリのタブと同じ動き）。
 * 例: 単語ページを見て AI タブへ移り、単語タブを押すとその単語ページに戻る。
 */
type Tab = NavItem['to']

const STORAGE = 'nev-ui:tabs'
let memory: Partial<Record<Tab | `root:${Tab}`, string>> = {}
try {
  memory = JSON.parse(sessionStorage.getItem(STORAGE) ?? '{}')
} catch {
  /* noop */
}

/** パスがどのタブに属するか（/e/・/m/ は単語タブ、/history はホーム） */
export function tabOf(pathname: string): Tab | null {
  if (pathname === '/' || pathname === '/history') return '/'
  if (pathname.startsWith('/words') || pathname.startsWith('/e/') || pathname.startsWith('/m/')) return '/words'
  for (const t of ['/network', '/study', '/analytics', '/ai', '/settings'] as const) if (pathname === t || pathname.startsWith(t + '/')) return t
  return null
}

export function rememberLocation(pathname: string, href: string) {
  const tab = tabOf(pathname)
  if (!tab) return
  memory[tab] = href
  // タブの最初のページ（一覧など）の検索条件も覚えておく
  if (pathname === tab) memory[`root:${tab}`] = href
  try {
    sessionStorage.setItem(STORAGE, JSON.stringify(memory))
  } catch {
    /* noop */
  }
}

/** タブを押したときの行き先: 別のタブからなら最後の場所、同じタブ内ならタブの最初のページ */
export function tabTarget(tab: Tab, currentPathname: string): string {
  if (tabOf(currentPathname) === tab) return currentPathname === tab ? tab : (memory[`root:${tab}`] ?? tab)
  return memory[tab] ?? tab
}
