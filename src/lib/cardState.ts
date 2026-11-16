import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { create } from 'zustand'

/**
 * 問題 1 枚ぶんの画面の状態（答えを見たか・メモ・選んだ選択肢・書いた答え・ヒントの段数など）を、
 * メモリに覚えておく仕組み。学習・語源ドリルの途中でほかのページへ移動して戻ってきたとき、解いている状態のまま再開できる。
 *
 * - 名前空間（study / drill）ごとに、今の問題 1 枚ぶんだけを持つ。別の問題（key が違う）になったら前の状態は捨てる
 * - ページを再読み込みしたら消える（メモリだけ）
 */

interface Slot {
  key: string
  data: Record<string, unknown>
}

const useCardStore = create<{ slots: Record<string, Slot> }>(() => ({ slots: {} }))

export interface CardScope {
  ns: string
  key: string
}

/** 今の問題（名前空間と key）。なければふつうの useState と同じ（覚えない） */
export const CardScopeContext = createContext<CardScope | null>(null)

/** 覚えている状態（key が今の問題と同じときだけ） */
export function cardSnapshot(scope: CardScope | null): Record<string, unknown> | null {
  if (!scope) return null
  const s = useCardStore.getState().slots[scope.ns]
  return s && s.key === scope.key ? s.data : null
}

export function saveCardValue(scope: CardScope | null, name: string, value: unknown) {
  if (!scope) return
  useCardStore.setState((st) => {
    const cur = st.slots[scope.ns]
    const data = cur && cur.key === scope.key ? { ...cur.data, [name]: value } : { [name]: value }
    return { slots: { ...st.slots, [scope.ns]: { key: scope.key, data } } }
  })
}

export function clearCardState(ns: string) {
  useCardStore.setState((st) => {
    const { [ns]: _drop, ...rest } = st.slots
    return { slots: rest }
  })
}

/**
 * useState と同じ使い方で、値を今の問題の状態として覚える。
 * コンポーネントを作り直したとき（ページを移動して戻ったとき）は、覚えた値から始める
 */
export function useCardState<T>(name: string, init: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const scope = useContext(CardScopeContext)
  const [value, setValue] = useState<T>(() => {
    const snap = cardSnapshot(scope)
    if (snap && name in snap) return snap[name] as T
    return typeof init === 'function' ? (init as () => T)() : init
  })
  // 最初の値（4 択の並びなど、作るたびに変わるもの）も覚える
  useEffect(() => {
    const snap = cardSnapshot(scope)
    if (!snap || !(name in snap)) saveCardValue(scope, name, value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.ns, scope?.key, name])
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (u) =>
      setValue((prev) => {
        const next = typeof u === 'function' ? (u as (p: T) => T)(prev) : u
        saveCardValue(scope, name, next)
        return next
      }),
    // scope はオブジェクトなので、中身で比べる
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope?.ns, scope?.key, name],
  )
  return [value, set]
}
