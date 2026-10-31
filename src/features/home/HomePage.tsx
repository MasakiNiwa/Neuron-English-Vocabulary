import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'

export function HomePage() {
  const { t } = useTranslation()
  return (
    <Page>
      <Card className="bg-accent-soft/60">
        <h1 className="mb-1 text-lg font-semibold">{t('app.name')}</h1>
        <p className="text-sm leading-relaxed text-muted">{t('home.intro')}</p>
      </Card>
    </Page>
  )
}
