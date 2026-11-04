import { useEffect, useState } from 'react'
import { useSettings } from '@/stores/settings'
import i18n from './i18n'
import { deviceLang, type Lang } from './lang'

/** いま使う表示言語（設定が「端末に合わせる」なら端末の言語。端末の言語が変わったら追従する） */
export function useLang(): Lang {
  const setting = useSettings((s) => s.language)
  const [dev, setDev] = useState(deviceLang)
  useEffect(() => {
    const f = () => setDev(deviceLang())
    window.addEventListener('languagechange', f)
    return () => window.removeEventListener('languagechange', f)
  }, [])
  return setting === 'auto' ? dev : setting
}

/** 画面の文言（i18n）の言語を表示言語に合わせる（ルートで 1 回だけ使う） */
export function useApplyLang() {
  const lang = useLang()
  useEffect(() => {
    if (i18n.language !== lang) void i18n.changeLanguage(lang)
  }, [lang])
}
