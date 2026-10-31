import { Accordion as A } from 'radix-ui'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * 見出しごとに折りたためるセクション群。既定では全て閉じる（defaultValue = []）。
 * 設定ページ・ヘルプページで共通利用。
 */
export function Accordion({ children, defaultOpen = [] }: { children: ReactNode; defaultOpen?: string[] }) {
  return (
    <A.Root type="multiple" defaultValue={defaultOpen} className="flex flex-col gap-2">
      {children}
    </A.Root>
  )
}

export function AccordionSection({
  value,
  title,
  icon,
  children,
}: {
  value: string
  title: ReactNode
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <A.Item value={value} className="overflow-hidden rounded-2xl border border-border bg-surface">
      <A.Header>
        <A.Trigger className="group flex w-full items-center gap-3 px-4 py-3.5 text-left font-medium hover:bg-surface-2">
          {icon && <span className="text-muted">{icon}</span>}
          <span className="flex-1">{title}</span>
          <ChevronDown className="size-4 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </A.Trigger>
      </A.Header>
      <A.Content className="accordion-content">
        <div className="border-t border-border px-4 py-4">{children}</div>
      </A.Content>
    </A.Item>
  )
}
