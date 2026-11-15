import { create } from 'zustand'
import type { StudyCard } from '@/lib/db'
import type { Skill } from './skills'

/**
 * 学習セッションの状態。ページを移動して戻ってきても、途中から再開できるようにメモリに保持する。
 */
interface StudySessionState {
  queue: StudyCard[] | null
  idx: number
  count: number
  mode: string
  /** このセッションで出すスキル（スキルを選んだ練習。なければ設定の出題形式） */
  skill: Skill | null
  startedAt: number
  done: number | null
  start: (queue: StudyCard[], mode: string, skill?: Skill | null) => void
  progress: (idx: number, count: number) => void
  finish: (count: number) => void
}

export const useStudySession = create<StudySessionState>((set) => ({
  queue: null,
  idx: 0,
  count: 0,
  mode: 'review',
  skill: null,
  startedAt: 0,
  done: null,
  start: (queue, mode, skill = null) => set({ queue, mode, skill, idx: 0, count: 0, startedAt: Date.now(), done: null }),
  progress: (idx, count) => set({ idx, count }),
  finish: (count) => set({ queue: null, done: count }),
}))
