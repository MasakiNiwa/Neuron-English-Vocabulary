import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** 各ページ共通の枠。幅とパディングを統一する */
export function Page({
  title,
  actions,
  children,
  className,
  wide,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <div className={cn('mx-auto w-full px-4 py-4 md:px-6 md:py-6', wide ? 'max-w-6xl' : 'max-w-3xl', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h1 className="text-xl font-semibold">{title}</h1>}
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}
