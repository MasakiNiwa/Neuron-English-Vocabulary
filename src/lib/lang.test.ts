import { describe, expect, it } from 'vitest'
import { dataLang, detectLang, joinWords, localWords, zhForm } from './lang'

describe('detectLang', () => {
  it('端末の言語の優先順から最初に対応する言語を選ぶ', () => {
    expect(detectLang(['ko-KR', 'en-US'])).toBe('ko')
    expect(detectLang(['en-US', 'zh-CN'])).toBe('zh-Hans')
    expect(detectLang(['zh-TW'])).toBe('zh-Hant')
    expect(detectLang(['zh-Hant-HK'])).toBe('zh-Hant')
    expect(detectLang(['zh-HK'])).toBe('zh-Hant')
    expect(detectLang(['zh'])).toBe('zh-Hans')
    expect(detectLang(['ja-JP', 'ko'])).toBe('ja')
  })
  it('どれにも当たらなければ日本語', () => {
    expect(detectLang(['en-US', 'fr'])).toBe('ja')
    expect(detectLang([])).toBe('ja')
  })
})

describe('中国語の字形', () => {
  it('「繁体 /简体」から選ぶ', () => {
    expect(zhForm('學習 /学习', 'zh-Hant')).toBe('學習')
    expect(zhForm('學習 /学习', 'zh-Hans')).toBe('学习')
    expect(zhForm('重要', 'zh-Hant')).toBe('重要')
  })
  it('重なりを除いてつなぐ', () => {
    expect(localWords(['跑', '跑', '奔跑'], 'zh-Hans')).toEqual(['跑', '奔跑'])
    expect(joinWords(localWords(['冊 /册', '書 /书'], 'zh-Hant'), 'zh-Hant')).toBe('冊、書')
    expect(joinWords(['달리다', '뛰다'], 'ko')).toBe('달리다, 뛰다')
  })
  it('データのキー', () => {
    expect(dataLang('ja')).toBeNull()
    expect(dataLang('ko')).toBe('ko')
    expect(dataLang('zh-Hant')).toBe('zh')
  })
})
