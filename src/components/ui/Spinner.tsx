import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function PageSpinner() {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-sm">{t('common.loading')}</span>
    </div>
  )
}
