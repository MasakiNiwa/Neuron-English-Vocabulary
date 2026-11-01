import { useLiveQuery } from 'dexie-react-hooks'
import { use } from 'react'
import { db } from '@/lib/db'
import { getEntry, loadDictionary, type Dictionary } from './data'
import type { Entry } from './types'

const entryPromises = new Map<string, Promise<Entry | null>>()

/** Suspense 対応: 辞書（索引）を取得 */
export function useDictionary(): Dictionary {
  return use(loadDictionary())
}

/** Suspense 対応: 単語の詳細を取得 */
export function useEntry(key: string): Entry | null {
  let p = entryPromises.get(key)
  if (!p) {
    p = getEntry(key)
    entryPromises.set(key, p)
  }
  return use(p)
}

/** 表示履歴を記録 */
export async function recordView(entryId: string, source?: string) {
  // 直近 3 秒以内の同一エントリの重複記録（StrictMode の二重実行など）は無視
  const last = await db.views.orderBy('viewedAt').last()
  if (last && last.entryId === entryId && Date.now() - last.viewedAt < 3000) return
  await db.views.add({ entryId, viewedAt: Date.now(), source })
}

export function useEntryViews(entryId: string) {
  return useLiveQuery(
    () => db.views.where('[entryId+viewedAt]').between([entryId, 0], [entryId, Infinity]).reverse().toArray(),
    [entryId],
  )
}

/** 最近見たエントリ（重複除外） */
export function useRecentEntries(limit = 20) {
  return useLiveQuery(async () => {
    const seen = new Set<string>()
    const out: { entryId: string; viewedAt: number }[] = []
    await db.views
      .orderBy('viewedAt')
      .reverse()
      .until(() => out.length >= limit)
      .each((v) => {
        if (!seen.has(v.entryId)) {
          seen.add(v.entryId)
          out.push({ entryId: v.entryId, viewedAt: v.viewedAt })
        }
      })
    return out
  }, [limit])
}
