import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Page } from '@/components/ui/Page'
import { RootLayout } from './RootLayout'

function NotFound() {
  const { t } = useTranslation()
  return (
    <Page>
      <p className="text-muted">{t('common.notFound')}</p>
      <Link to="/" className="mt-4 inline-block text-accent underline">
        {t('common.backHome')}
      </Link>
    </Page>
  )
}

const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFound })

/** ページは全て遅延読み込み（コード分割）。機能追加時はここにルートを足す */
const page = <P extends string>(path: P, load: () => Promise<Record<string, unknown>>, name: string) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: lazyRouteComponent(load as never, name as never),
  })

const routeTree = rootRoute.addChildren([
  page('/', () => import('@/features/home/HomePage'), 'HomePage'),
  page('/words', () => import('@/features/words/WordsPage'), 'WordsPage'),
  page('/network', () => import('@/features/network/NetworkPage'), 'NetworkPage'),
  page('/study', () => import('@/features/study/StudyPage'), 'StudyPage'),
  page('/analytics', () => import('@/features/analytics/AnalyticsPage'), 'AnalyticsPage'),
  page('/ai', () => import('@/features/ai/AiPage'), 'AiPage'),
  page('/settings', () => import('@/features/settings/SettingsPage'), 'SettingsPage'),
  page('/help', () => import('@/features/help/HelpPage'), 'HelpPage'),
])

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultViewTransition: true,
  scrollRestoration: true,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
