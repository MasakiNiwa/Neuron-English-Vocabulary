import { Search, X } from 'lucide-react'
import { forwardRef, type InputHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

/** クリアボタン付き検索ボックス */
export const SearchField = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { value: string; onValueChange: (v: string) => void }
>(function SearchField({ value, onValueChange, className, ...props }, ref) {
  const { t } = useTranslation()
  return (
    <div className={cn('relative flex items-center', className)}>
      <Search className="pointer-events-none absolute left-3.5 size-4 text-muted" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="h-12 w-full rounded-2xl border border-border bg-surface pl-10 pr-11 text-base outline-none placeholder:text-muted focus:border-accent [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label={t('common.clear')}
          title={t('common.clear')}
          onClick={() => onValueChange('')}
          className="absolute right-2 inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
})
