import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LanguageCode } from '@/lib/i18n'
import { migrateFormat, type ConcreteFormat } from '@/features/study/formatDefs'

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
  /** 出題形式（複数選択。選んだ中から出題する） */
  studyFormats: ConcreteFormat[]
  /** おまかせ: 覚え具合に合わせて形式を選ぶ（新しい語は意味を答える、覚えてきた語は英語を答える） */
  studyAuto: boolean
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
  studyFormats: ['en2ja'],
  studyAuto: true,
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
      version: 6,
      migrate: (state, version) => {
        const s = state as Partial<Settings>
        // v2: 1日の新規カード上限の既定を「無制限 (0)」に変更
        if (version < 2 && s.dailyNewLimit === 20) s.dailyNewLimit = 0
        // v3〜v4: 韓国語・中国語への切り替えを一時的に入れて外した。日本語に戻す
        if (version < 4) s.language = 'ja'
        // v5〜v6: 出題形式を単一選択（studyFormat。'mix'・'ja2speak' を含む）から複数選択（studyFormats）に
        if (version < 6) {
          const old = (s as { studyFormat?: unknown }).studyFormat
          s.studyFormats = migrateFormat(old)
          s.studyAuto = true
          delete (s as { studyFormat?: unknown }).studyFormat
        }
        return s as never
      },
    },
  ),
)
