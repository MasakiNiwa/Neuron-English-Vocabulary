import { Link } from '@tanstack/react-router'
import { Volume2 } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { speak } from '@/lib/speech'
import { headword, lookupWord } from '../data'
import { useDictionary } from '../hooks'
import type { Morpheme } from '../types'
import { useMorphMeaning } from '@/features/dictionary/localGloss'

/** 単語・熟語へのリンク（アプリ内のどこからでも直接移動できるようにする共通部品） */
export function EntryLink({ k, className, children }: { k: string; className?: string; children?: ReactNode }) {
  return (
    <Link to="/e/$key" params={{ key: k }} className={cn('text-accent hover:underline', className)}>
      {children ?? headword(k)}
    </Link>
  )
}

export function MorphemeLink({ m, className }: { m: Morpheme; className?: string }) {
  const mm = useMorphMeaning()
  return (
    <Link
      to="/m/$id"
      params={{ id: m.id }}
      className={cn('inline-flex items-baseline gap-1 rounded-lg bg-accent-soft px-2 py-0.5 text-sm text-accent hover:opacity-80', className)}
    >
      <span className="font-en font-medium">{morphLabel(m)}</span>
      <span className="text-xs opacity-80">{mm(m)}</span>
    </Link>
  )
}

export function morphLabel(m: Morpheme) {
  return m.type === 'prefix' ? `${m.label}-` : m.type === 'suffix' ? `-${m.label}` : m.label
}

export const MORPH_TYPE_LABEL: Record<Morpheme['type'], string> = {
  root: '語根',
  prefix: '接頭辞',
  suffix: '接尾辞',
  pie: '印欧祖語',
  particle: '不変化詞',
}

/** 英文中の既知の単語を自動でリンク化する */
export function LinkedText({ text, highlight }: { text: string; highlight?: Set<string> }) {
  const dict = useDictionary()
  const parts = text.split(/([A-Za-z][A-Za-z'’-]*)/)
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>
        const k = lookupWord(dict, p)
        const hl = highlight?.has(p.toLowerCase())
        if (!k) return <span key={i} className={cn(hl && 'font-semibold')}>{p}</span>
        return (
          <Link
            key={i}
            to="/e/$key"
            params={{ key: k }}
            className={cn('decoration-accent/40 underline-offset-4 hover:text-accent hover:underline', hl && 'font-semibold text-accent')}
          >
            {p}
          </Link>
        )
      })}
    </>
  )
}

export function SpeakButton({ text, className, size = 'md' }: { text: string; className?: string; size?: 'sm' | 'md' }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        speak(text)
      }}
      aria-label={t('common.speak')}
      title={t('common.speak')}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-accent',
        size === 'sm' ? 'size-7' : 'size-10',
        className,
      )}
    >
      <Volume2 className={size === 'sm' ? 'size-4' : 'size-5'} />
    </button>
  )
}
