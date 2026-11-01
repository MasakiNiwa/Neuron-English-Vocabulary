import { create } from 'zustand'
import type { StudyCard } from '@/lib/db'

/**
 * 学習セッションの状態。ページを移動して戻ってきても、途中から再開できるようにメモリに保持する。
 */
interface StudySessionState {
  queue: StudyCard[] | null
  idx: number
  count: number
  mode: string
  startedAt: number
  done: number | null
  start: (queue: StudyCard[], mode: string) => void
  progress: (idx: number, count: number) => void
  finish: (count: number) => void
}

export const useStudySession = create<StudySessionState>((set) => ({
  queue: null,
  idx: 0,
  count: 0,
  mode: 'review',
  startedAt: 0,
  done: null,
  start: (queue, mode) => set({ queue, mode, idx: 0, count: 0, startedAt: Date.now(), done: null }),
  progress: (idx, count) => set({ idx, count }),
  finish: (count) => set({ queue: null, done: count }),
}))
