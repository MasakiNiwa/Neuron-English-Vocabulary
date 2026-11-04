import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { dataLang, joinWords, localWords, type Lang } from '@/lib/lang'
import { useLang } from '@/lib/useLang'
import { fetchJson } from './data'
import { useDictionary } from './hooks'
import type { IndexEntry } from './types'

/**
 * 一覧用の韓国語・中国語の短い訳（public/data/gloss-ko.json / gloss-zh.json）。
 * 表示言語が ko / zh のときだけ読み込む。読み込むまで・訳がない語は日本語の訳を出す
 */
type GlossMap = Record<string, string[]>
const loaded = new Map<'ko' | 'zh', GlossMap>()
const pending = new Map<'ko' | 'zh', Promise<void>>()
const listeners = new Set<() => void>()

export function loadLocalGloss(d: 'ko' | 'zh', version: string): Promise<void> {
  if (loaded.has(d)) return Promise.resolve()
  let p = pending.get(d)
  if (!p) {
    p = fetchJson<{ v: string; g: GlossMap }>(`data/gloss-${d}.json?v=${version}`)
      .then((j) => {
        loaded.set(d, j.g)
        listeners.forEach((f) => f())
      })
      .catch(() => {
        pending.delete(d)
      })
    pending.set(d, p)
  }
  return p
}

const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** 表示言語での訳語（なければ null） */
export function localGloss(map: GlossMap | undefined, key: string, lang: Lang): string[] | null {
  const w = localWords(map?.[key], lang)
  return w.length ? w : null
}

/**
 * 一覧に出す訳の文字列を返す関数。first なら最初の 1 語だけ
 * 表示言語の訳がない語は日本語の訳（索引の gloss）
 */
export function useGlossText() {
  const lang = useLang()
  const d = dataLang(lang)
  const dict = useDictionary()
  const map = useSyncExternalStore(subscribe, () => (d ? loaded.get(d) : undefined))
  useEffect(() => {
    if (d) void loadLocalGloss(d, dict.version)
  }, [d, dict.version])
  return useCallback(
    (e: IndexEntry | undefined, first = false): string => {
      if (!e) return ''
      const w = d ? localGloss(map, e.key, lang) : null
      if (w) return first ? w[0] : joinWords(w, lang)
      return first ? e.gloss.split('、')[0] : e.gloss
    },
    [d, map, lang],
  )
}
