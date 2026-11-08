import { useSyncExternalStore } from 'react'

/**
 * 語根めぐりの記録: 訪れた語根・接頭辞・祖語など（つながりで中心にした・語根のページを開いた）。
 * 端末の localStorage に ID の一覧で保存する（学習の記録ではないので、バックアップには含めない）
 */
const KEY = 'nev-visited-morphs'
const listeners = new Set<() => void>()
let snapshot: ReadonlySet<string> = read()

function read(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** 語根を訪れたことを記録する（形態素の ID） */
export function markVisited(id: string) {
  if (!id || snapshot.has(id)) return
  const next = new Set(snapshot)
  next.add(id)
  snapshot = next
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch {
    /* 保存できなくても、この画面の間は覚えている */
  }
  listeners.forEach((l) => l())
}

export function useVisitedMorphs(): ReadonlySet<string> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
  )
}
