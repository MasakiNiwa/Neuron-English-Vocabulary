/**
 * 表示言語。設定は「端末に合わせる（auto）」か、言語を直接選ぶ。
 * 単語の訳（gloss）と、i18n のキーで書いた画面の文言が切り替わる
 */
export type Lang = 'ja' | 'ko' | 'zh-Hans' | 'zh-Hant'
export type LangSetting = 'auto' | Lang

export const LANGS: { code: Lang; label: string; htmlLang: string }[] = [
  { code: 'ja', label: '日本語', htmlLang: 'ja' },
  { code: 'ko', label: '한국어', htmlLang: 'ko' },
  { code: 'zh-Hans', label: '简体中文', htmlLang: 'zh-Hans' },
  { code: 'zh-Hant', label: '繁體中文', htmlLang: 'zh-Hant' },
]

export const LANG_SETTINGS: LangSetting[] = ['auto', 'ja', 'ko', 'zh-Hans', 'zh-Hant']

export function isLangSetting(x: unknown): x is LangSetting {
  return typeof x === 'string' && (LANG_SETTINGS as string[]).includes(x)
}

/** 端末の言語の優先順から決める。日本語・韓国語・中国語のうち最初に出てきたもの。どれもなければ日本語 */
export function detectLang(langs: readonly string[]): Lang {
  for (const raw of langs) {
    const l = raw.toLowerCase()
    if (l.startsWith('ja')) return 'ja'
    if (l.startsWith('ko')) return 'ko'
    if (l.startsWith('zh')) {
      if (/hant|-tw|-hk|-mo/.test(l)) return 'zh-Hant'
      return 'zh-Hans'
    }
  }
  return 'ja'
}

export function deviceLang(): Lang {
  if (typeof navigator === 'undefined') return 'ja'
  return detectLang(navigator.languages?.length ? navigator.languages : [navigator.language ?? 'ja'])
}

export function resolveLang(s: LangSetting): Lang {
  return s === 'auto' ? deviceLang() : s
}

export function langLabel(l: Lang): string {
  return LANGS.find((x) => x.code === l)?.label ?? l
}

/** 訳のデータのどのキーを使うか（中国語は簡体・繁体で同じデータ） */
export function dataLang(l: Lang): 'ko' | 'zh' | null {
  return l === 'ko' ? 'ko' : l === 'zh-Hans' || l === 'zh-Hant' ? 'zh' : null
}

/**
 * Wiktionary の中国語訳は「繁体 /简体」の形のことがある（同じ字形なら 1 つだけ）。
 * 選んだ字形の方を返す
 */
export function zhForm(s: string, l: Lang): string {
  const i = s.indexOf(' /')
  if (i < 0) return s.trim()
  return (l === 'zh-Hant' ? s.slice(0, i) : s.slice(i + 2)).trim()
}

/** 訳語のリストを表示する形に（中国語は字形を選び、重なりを除く） */
export function localWords(words: readonly string[] | undefined, l: Lang): string[] {
  if (!words?.length) return []
  const out: string[] = []
  for (const w of words) {
    const x = l === 'zh-Hans' || l === 'zh-Hant' ? zhForm(w, l) : w.trim()
    if (x && !out.includes(x)) out.push(x)
  }
  return out
}

/** 訳語をつなぐ区切り */
export function joinWords(words: string[], l: Lang): string {
  return words.join(l === 'ko' ? ', ' : '、')
}
