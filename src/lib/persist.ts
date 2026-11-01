import { useCallback, useState } from 'react'

/**
 * アプリ内でページを移動して戻ってきたときに、画面の状態（表示件数・選択・開閉など）を保つためのフック。
 * メモリ + sessionStorage に保存する（タブを閉じるとリセット）。
 */
const mem = new Map<string, unknown>()

function read<T>(key: string, initial: T): T {
  if (mem.has(key)) return mem.get(key) as T
  try {
    const raw = sessionStorage.getItem('nev-ui:' + key)
    if (raw !== null) return JSON.parse(raw) as T
  } catch {
    /* 読めなければ初期値 */
  }
  return initial
}

export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, initial))
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
        mem.set(key, next)
        try {
          sessionStorage.setItem('nev-ui:' + key, JSON.stringify(next))
        } catch {
          /* 保存できなくてもメモリには残る */
        }
        return next
      })
    },
    [key],
  )
  return [value, set]
}
