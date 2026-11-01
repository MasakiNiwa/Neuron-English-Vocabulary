import type { ReactNode } from 'react'

export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-xl bg-surface-2 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            'rounded-lg px-3 py-1.5 text-sm transition-colors ' +
            (value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const selectClass =
  'h-10 max-w-64 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent'

