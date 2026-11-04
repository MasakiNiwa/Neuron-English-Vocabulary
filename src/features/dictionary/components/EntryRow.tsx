import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { headword } from '../data'
import { useGlossText } from '../localGloss'
import type { IndexEntry } from '../types'

/** 一覧表示用の1行 */
export function EntryRow({ e, right }: { e: IndexEntry; right?: ReactNode }) {
  const gloss = useGlossText()
  return (
    <Link
      to="/e/$key"
      params={{ key: e.key }}
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2"
    >
      <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted">
        {e.type === 'p' ? '熟' : ''}
        {e.rank}
      </span>
      <span className="font-en min-w-0 shrink-0 font-medium">{headword(e.key)}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{gloss(e)}</span>
      {right}
    </Link>
  )
}
