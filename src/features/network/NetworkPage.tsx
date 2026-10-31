import { useTranslation } from 'react-i18next'
import { ComingSoon } from '@/components/ComingSoon'

export function NetworkPage() {
  const { t } = useTranslation()
  return <ComingSoon title={t('network.title')} />
}
