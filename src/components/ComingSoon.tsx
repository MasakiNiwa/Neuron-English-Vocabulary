import { Construction } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Page } from './ui/Page'

export function ComingSoon({ title }: { title: string }) {
  const { t } = useTranslation()
  return (
    <Page title={title}>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center text-muted">
        <Construction className="size-8" />
        <p>{t('common.comingSoon')}</p>
      </div>
    </Page>
  )
}
