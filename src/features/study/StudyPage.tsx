import { useTranslation } from 'react-i18next'
import { ComingSoon } from '@/components/ComingSoon'

export function StudyPage() {
  const { t } = useTranslation()
  return <ComingSoon title={t('study.title')} />
}
