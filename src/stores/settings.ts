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
  /** 1日の新規カード上限（0 = 無制限） */
  dailyNewLimit: number
  desiredRetention: number
  /** 「カードを追加」で追加を始める頻度順位 */
  studyStartRank: number
  /** 出題形式 */
  studyFormat: 'en2ja' | 'ja2en' | 'cloze' | 'choice' | 'speak' | 'mix'
}

export const defaultSettings: Settings = {
  theme: 'system',
  language: 'ja',
  reduceMotion: false,
  ttsVoiceURI: null,
  ttsRate: 0.95,
  autoSpeak: false,
  dailyNewLimit: 0,
  desiredRetention: 0.9,
  studyStartRank: 500,
  studyFormat: 'en2ja',
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
    {
      name: 'nev-settings',
      version: 5,
      migrate: (state, version) => {
        const s = state as Partial<Settings>
        // v2: 1日の新規カード上限の既定を「無制限 (0)」に変更
        if (version < 2 && s.dailyNewLimit === 20) s.dailyNewLimit = 0
        // v3〜v4: 韓国語・中国語への切り替えを一時的に入れて外した。日本語に戻す
        if (version < 4) s.language = 'ja'
        // v5: 日→話す（ja2speak）は日→英の「話す」に統合した
        if (version < 5 && (s.studyFormat as string) === 'ja2speak') s.studyFormat = 'ja2en'
        return s as never
      },
    },
  ),
)
