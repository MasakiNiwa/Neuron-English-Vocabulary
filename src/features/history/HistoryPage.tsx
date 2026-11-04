import { useLiveQuery } from 'dexie-react-hooks'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { clearHistory, db } from '@/lib/db'
import { usePersistentState } from '@/lib/persist'
import { EntryLink } from '@/features/dictionary/components/links'
import { useDictionary } from '@/features/dictionary/hooks'
import { useGlossText } from '@/features/dictionary/localGloss'

function HistoryList() {
  const { t } = useTranslation()
  const dict = useDictionary()
  const gloss = useGlossText()
  const [limit, setLimit] = usePersistentState('history:limit', 200)
  const views = useLiveQuery(() => db.views.orderBy('viewedAt').reverse().limit(limit).toArray(), [limit])
  if (!views) return <PageSpinner />
  if (!views.length) return <p className="py-10 text-center text-muted">{t('home.noHistory')}</p>
  // 日付ごとにグループ化
  const groups = new Map<string, typeof views>()
  for (const v of views) {
    const d = new Date(v.viewedAt).toLocaleDateString()
    groups.set(d, [...(groups.get(d) ?? []), v])
  }
  return (
    <div className="flex flex-col gap-4">
      {[...groups].map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-1.5 text-sm font-semibold text-muted">
            {day}（{list.length}）
          </h2>
          <Card className="divide-y divide-border p-0">
            {list.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-12 shrink-0 font-mono text-xs text-muted">
                  {new Date(v.viewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <EntryLink k={v.entryId} className="font-en shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{gloss(dict.byKey.get(v.entryId))}</span>
              </div>
            ))}
          </Card>
        </section>
      ))}
      {views.length >= limit && <Button onClick={() => setLimit((l) => l + 300)}>{t('common.more')}</Button>}
    </div>
  )
}

export function HistoryPage() {
  const { t } = useTranslation()
  return (
    <Page
      title={t('words.history')}
      actions={
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            if (confirm(t('settings.clearConfirm'))) void clearHistory()
          }}
        >
          {t('common.clear')}
        </Button>
      }
    >
      <Suspense fallback={<PageSpinner />}>
        <HistoryList />
      </Suspense>
    </Page>
  )
}
