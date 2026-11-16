import { create } from 'zustand'
import { clearCardState } from '@/lib/cardState'
import type { Answer } from './drill'
import type { DrillItem } from './questions'

/** 1 回分のドリルの出題の仕方 */
export type Plan = { random?: number; only?: string[]; review?: string[]; practice?: string }

/**
 * 語源ドリルの 1 回分の状態。ページを移動して戻ってきても、途中から再開できるようにメモリに保持する
 * （問題の画面の状態は lib/cardState の 'drill'）
 */
interface DrillSessionState {
  plan: Plan | null
  items: DrillItem[] | null
  i: number
  answers: Answer[]
  /** 途中で「中断」した */
  stopped: boolean
  /** 答えを記録した（二重に記録しない） */
  saved: boolean
  startedAt: number
  start: (plan: Plan) => void
  set: (patch: Partial<Pick<DrillSessionState, 'items' | 'i' | 'answers' | 'stopped' | 'saved'>>) => void
  clear: () => void
}

export const useDrillSession = create<DrillSessionState>((set) => ({
  plan: null,
  items: null,
  i: 0,
  answers: [],
  stopped: false,
  saved: false,
  startedAt: 0,
  start: (plan) => {
    clearCardState('drill')
    set({ plan, items: null, i: 0, answers: [], stopped: false, saved: false, startedAt: Date.now() })
  },
  set: (patch) => set(patch),
  clear: () => {
    clearCardState('drill')
    set({ plan: null, items: null, i: 0, answers: [], stopped: false, saved: false })
  },
}))
