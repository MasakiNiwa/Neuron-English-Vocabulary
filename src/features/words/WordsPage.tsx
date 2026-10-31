import { useTranslation } from 'react-i18next'
import { ComingSoon } from '@/components/ComingSoon'

export function WordsPage() {
  const { t } = useTranslation()
  return <ComingSoon title={t('words.title')} />
}
