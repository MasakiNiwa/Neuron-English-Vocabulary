import { Link, Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { onDataOutdated } from '@/features/dictionary/data'
import { scrollBehavior, useApplyMotion } from '@/lib/motion'
import { useEffect, useState } from 'react'
import { warmupSearch } from '@/features/dictionary/search'
import { CircleHelp, ImageDown, LoaderCircle, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { toggleTheme, useApplyTheme, useResolvedTheme } from '@/lib/theme'
import { navItems, type NavItem } from './nav'
import { ScrollRestorer } from './ScrollRestorer'
import { rememberLocation, tabOf, tabTarget } from './tabMemory'

function isActive(pathname: string, to: string) {
  return tabOf(pathname) === to
}

/** タブのリンク: 別のタブから押すと最後に見ていたページへ、同じタブで押すとタブの最初のページへ */
function useTabClick(pathname: string) {
  const router = useRouter()
  return (to: NavItem['to']) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    const href = tabTarget(to, pathname)
    if (href === router.state.location.href) return window.scrollTo({ top: 0, behavior: scrollBehavior() })
    void router.navigate({ href })
  }
}

/** ヘッダーの「このページを画像で保存」: 今のページ全体を 1 枚の縦長の画像にする */
function ScreenshotButton() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const onClick = async () => {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      const { savePageScreenshot } = await import('@/lib/screenshot')
      await savePageScreenshot()
    } catch (e) {
      console.error(e)
      setError(true)
      setTimeout(() => setError(false), 4000)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <IconButton data-screenshot-plain label={t('header.screenshot')} onClick={() => void onClick()} disabled={busy} aria-busy={busy}>
        {/* 画像の中では、くるくるではなくふだんのアイコンを写す */}
        <ImageDown className={cn('size-5', busy && 'hidden')} data-screenshot-show="block" />
        {busy && <LoaderCircle className="size-5 animate-spin" data-screenshot-skip />}
      </IconButton>
      {(busy || error) && (
        <div role="status" className="fixed inset-x-0 top-16 z-50 flex justify-center px-4" data-screenshot-skip>
          <span className="rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-lg">
            {busy ? '画像を作っています…' : '画像を作れませんでした。もう一度お試しください'}
          </span>
        </div>
      )}
    </>
  )
}

function Header() {
  const { t } = useTranslation()
  const theme = useResolvedTheme()
  return (
    <header className="vt-header sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur md:px-5">
      <Link to="/" className="flex items-center gap-2 font-semibold">
        <img src="./icon.svg" alt="" className="size-7 rounded-lg" />
        <span>{t('app.name')}</span>
      </Link>
      <div className="flex-1" />
      <ScreenshotButton />
      <IconButton label={t('header.toggleTheme')} onClick={() => toggleTheme(theme)}>
        {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </IconButton>
      <Link to="/help" aria-label={t('header.help')} title={t('header.help')}>
        {({ isActive }) => (
          <span
            className={cn(
              'inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg',
              isActive && 'text-accent',
            )}
          >
            <CircleHelp className="size-5" />
          </span>
        )}
      </Link>
    </header>
  )
}

function SideNav({ pathname }: { pathname: string }) {
  const { t } = useTranslation()
  const onTab = useTabClick(pathname)
  return (
    <nav className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-20 shrink-0 flex-col gap-1 border-r border-border p-2 md:flex lg:w-52">
      {navItems.map(({ to, labelKey, icon: Icon }) => {
        const active = isActive(pathname, to)
        return (
          <Link
            key={to}
            to={to}
            onClick={onTab(to)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-fg lg:flex-row lg:gap-3 lg:px-3 lg:text-sm',
              active && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent',
            )}
          >
            <Icon className="size-5 shrink-0" />
            <span>{t(labelKey)}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function BottomNav({ pathname }: { pathname: string }) {
  const { t } = useTranslation()
  const onTab = useTabClick(pathname)
  return (
    <nav className="vt-nav pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur md:hidden">
      <ul className="flex">
        {navItems.map(({ to, labelKey, icon: Icon }) => {
          const active = isActive(pathname, to)
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                onClick={onTab(to)}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted',
                  active && 'text-accent',
                )}
              >
                <span className={cn('rounded-full px-3 py-0.5 transition-colors', active && 'bg-accent-soft')}>
                  <Icon className="size-5" />
                </span>
                <span className="leading-none">{t(labelKey)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** 辞書データが新しい版に更新されたことを知らせ、再読み込みを促す（レビュー B03） */
/** 古い索引をキャッシュから消してから再読み込みする（オフライン用に保存した詳細データは版ごとなので残す） */
async function reloadWithFreshData() {
  try {
    for (const name of await caches.keys()) {
      if (name === 'nev-data-index' || name === 'nev-data') {
        const cache = await caches.open(name)
        for (const req of await cache.keys()) if (/\/data\/(index|meta)\.json/.test(req.url)) await cache.delete(req)
      }
    }
  } catch {
    // Cache API が使えない環境でも再読み込みはする
  }
  location.reload()
}

function DataUpdatedBar() {
  const [show, setShow] = useState(false)
  useEffect(() => onDataOutdated(() => setShow(true)), [])
  if (!show) return null
  return (
    <div role="status" className="flex items-center gap-2 border-b border-border bg-accent-soft px-4 py-2 text-sm">
      <span className="flex-1">辞書データが新しくなりました。再読み込みすると最新の内容で表示されます。</span>
      <button type="button" onClick={() => void reloadWithFreshData()} className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg">
        再読み込み
      </button>
    </div>
  )
}

export function RootLayout() {
  useApplyTheme()
  useApplyMotion()
  const navigate = useNavigate()
  useEffect(() => {
    warmupSearch()
    // キーボードショートカット: "/" で検索へ
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault()
        void navigate({ to: '/words' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const href = useRouterState({ select: (s) => s.location.href })
  useEffect(() => rememberLocation(pathname, href), [pathname, href])
  return (
    <div id="app-shell" className="flex min-h-dvh flex-col">
      <ScrollRestorer />
      <Header />
      <DataUpdatedBar />
      <div className="flex flex-1">
        <SideNav pathname={pathname} />
        <main className="vt-main min-w-0 flex-1 pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav pathname={pathname} />
    </div>
  )
}
