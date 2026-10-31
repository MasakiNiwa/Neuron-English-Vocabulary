import { useTranslation } from 'react-i18next'
import { ComingSoon } from '@/components/ComingSoon'

export function AiPage() {
  const { t } = useTranslation()
  return <ComingSoon title={t('ai.title')} />
}
