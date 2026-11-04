import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LangSetting } from '@/lib/lang'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeMode
  /** 表示言語（auto = 端末の言語に合わせる） */
  language: LangSetting
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
  studyFormat: 'en2ja' | 'ja2en' | 'cloze' | 'choice' | 'speak' | 'ja2speak' | 'mix'
}

export const defaultSettings: Settings = {
  theme: 'system',
  language: 'auto',
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
      version: 3,
      migrate: (state, version) => {
        const s = state as Partial<Settings>
        // v2: 1日の新規カード上限の既定を「無制限 (0)」に変更
        if (version < 2 && s.dailyNewLimit === 20) s.dailyNewLimit = 0
        // v3: 表示言語に「端末に合わせる」を追加して既定に（それまでは日本語しか選べなかった）
        if (version < 3 && s.language === 'ja') s.language = 'auto'
        return s as never
      },
    },
  ),
)
