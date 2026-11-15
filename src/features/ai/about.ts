import { headword } from '@/features/dictionary/data'

/**
 * AI チャットの話題（thread.about）。単語は見出しのキー（run, look_at）、
 * 語源は「m:」+ 形態素 ID（m:r:spec, m:pre:ex, m:pie:spek）
 */
export const MORPH_PREFIX = 'm:'

export const morphAbout = (id: string) => MORPH_PREFIX + id
export const morphIdOf = (about: string | undefined) => (about?.startsWith(MORPH_PREFIX) ? about.slice(MORPH_PREFIX.length) : null)

/** 話題の表示名（辞書を読まずに作れる形。語源は接頭辞なら ex-、接尾辞なら -able） */
export function aboutLabel(about: string): string {
  const id = morphIdOf(about)
  if (id === null) return headword(about)
  const [type, ...rest] = id.split(':')
  const label = rest.join(':')
  return type === 'pre' ? `${label}-` : type === 'suf' ? `-${label}` : type === 'pie' ? `*${label}-` : label
}
