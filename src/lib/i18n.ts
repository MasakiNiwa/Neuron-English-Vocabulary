import i18n, { type ParseKeys } from 'i18next'
import { initReactI18next } from 'react-i18next'
import ja, { type Resource } from '@/locales/ja'

/**
 * 対応言語の一覧。言語を追加するときは:
 *  1. src/locales/<code>.ts を ja.ts と同じ構造で作成
 *  2. ここに登録（resources と supportedLanguages）
 *  3. 単語データ側は gloss の <code> キーを追加（例: { ja: '…', ko: '…' }）
 */
export const supportedLanguages = [
  { code: 'ja', label: '日本語' },
  // { code: 'ko', label: '한국어' },
  // { code: 'zh', label: '中文' },
] as const

export type LanguageCode = (typeof supportedLanguages)[number]['code']

export const resources = {
  ja: { translation: ja },
} satisfies Record<LanguageCode, { translation: Resource }>

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: Resource }
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: 'ja',
  fallbackLng: 'ja',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n

/** 翻訳キーの型（存在しないキーはコンパイルエラーになる） */
export type TKey = ParseKeys<'translation'>
