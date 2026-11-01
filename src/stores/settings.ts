import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LanguageCode } from '@/lib/i18n'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeMode
  language: LanguageCode
  reduceMotion: boolean
  ttsVoiceURI: string | null
  ttsRate: number
  autoSpeak: boolean
  dailyNewLimit: number
  desiredRetention: number
  /** 「カードを追加」で追加を始める頻度順位 */
  studyStartRank: number
}

export const defaultSettings: Settings = {
  theme: 'system',
  language: 'ja',
  reduceMotion: false,
  ttsVoiceURI: null,
  ttsRate: 0.95,
  autoSpeak: false,
  dailyNewLimit: 20,
  desiredRetention: 0.9,
  studyStartRank: 500,
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  reset: () => void
}

/** 小さな設定値は localStorage（同期読み込みでテーマのちらつきを防ぐ）。大きなデータは IndexedDB へ。 */
export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      set: (key, value) => set({ [key]: value } as Partial<Settings>),
      reset: () => set({ ...defaultSettings }),
    }),
    { name: 'nev-settings', version: 1 },
  ),
)
