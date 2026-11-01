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
import { validateWordsSearch } from '@/features/words/search'
import { validateNetworkSearch } from '@/features/network/search'
import { validateAiSearch } from '@/features/ai/search'

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
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/words',
    validateSearch: validateWordsSearch,
    component: lazyRouteComponent(() => import('@/features/words/WordsPage'), 'WordsPage'),
  }),
  page('/e/$key', () => import('@/features/dictionary/EntryPage'), 'EntryPage'),
  page('/m/$id', () => import('@/features/dictionary/MorphemePage'), 'MorphemePage'),
  page('/history', () => import('@/features/history/HistoryPage'), 'HistoryPage'),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/network',
    validateSearch: validateNetworkSearch,
    component: lazyRouteComponent(() => import('@/features/network/NetworkPage'), 'NetworkPage'),
  }),
  page('/study', () => import('@/features/study/StudyPage'), 'StudyPage'),
  page('/analytics', () => import('@/features/analytics/AnalyticsPage'), 'AnalyticsPage'),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/ai',
    validateSearch: validateAiSearch,
    component: lazyRouteComponent(() => import('@/features/ai/AiPage'), 'AiPage'),
  }),
  page('/settings', () => import('@/features/settings/SettingsPage'), 'SettingsPage'),
  page('/help', () => import('@/features/help/HelpPage'), 'HelpPage'),
])

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultViewTransition: true,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
