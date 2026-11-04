import i18n, { type ParseKeys } from 'i18next'
import { initReactI18next } from 'react-i18next'
import ja, { type Resource } from '@/locales/ja'
import ko from '@/locales/ko'
import zhHans from '@/locales/zh-Hans'
import zhHant from '@/locales/zh-Hant'
import { useSettings } from '@/stores/settings'
import { resolveLang, type Lang } from './lang'

/**
 * UI 文言の言語。言語を追加するときは:
 *  1. src/locales/<code>.ts を ja.ts と同じ構造で作成
 *  2. ここの resources と src/lib/lang.ts の LANGS に登録
 *  3. 単語データ側は gloss の <code> キーと public/data/gloss-<code>.json（04_build.py）
 * キーにしていない画面の文言は日本語のまま
 */
export const resources = {
  ja: { translation: ja },
  ko: { translation: ko },
  'zh-Hans': { translation: zhHans },
  'zh-Hant': { translation: zhHant },
} satisfies Record<Lang, { translation: Resource }>

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: Resource }
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLang(useSettings.getState().language),
  fallbackLng: 'ja',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n

/** 翻訳キーの型（存在しないキーはコンパイルエラーになる） */
export type TKey = ParseKeys<'translation'>
