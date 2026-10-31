import { useTranslation } from 'react-i18next'
import { ComingSoon } from '@/components/ComingSoon'

export function AnalyticsPage() {
  const { t } = useTranslation()
  return <ComingSoon title={t('analytics.title')} />
}
