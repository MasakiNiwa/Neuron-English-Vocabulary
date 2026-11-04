import i18n, { type ParseKeys } from 'i18next'
import { initReactI18next } from 'react-i18next'
import ja, { type Resource } from '@/locales/ja'

/**
 * 対応言語の一覧。いまは日本語だけ。
 * 韓国語・中国語への切り替え（v0.110.0〜v0.114.0）は、翻訳の管理と正しさの確認の方法が決まるまで外した（ROADMAP を参照）。
 * 言語を追加するときは src/locales/<code>.ts を ja.ts と同じ構造で作り、ここに登録する
 */
export const supportedLanguages = [{ code: 'ja', label: '日本語' }] as const

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
