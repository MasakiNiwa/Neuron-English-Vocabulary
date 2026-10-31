import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'bg-surface-2 text-fg hover:bg-border',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}

export function IconButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg',
        className,
      )}
      {...props}
    />
  )
}
