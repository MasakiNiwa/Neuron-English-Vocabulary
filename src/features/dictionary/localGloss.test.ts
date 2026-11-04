import { describe, expect, it } from 'vitest'
import { localGloss, morphMeaning } from './localGloss'
import type { Morpheme } from './types'

const m = (meaning: Morpheme['meaning']) => ({ id: 'r:x', type: 'root', label: 'x', forms: [], meaning, origin: '', words: [] }) as unknown as Morpheme

describe('語根・接辞の意味', () => {
  it('表示言語の訳を使い、なければ日本語', () => {
    const x = m({ ja: '行う', ko: '행하다', zh: '行动', 'zh-Hant': '行動' })
    expect(morphMeaning(x, 'ja')).toBe('行う')
    expect(morphMeaning(x, 'ko')).toBe('행하다')
    expect(morphMeaning(x, 'zh-Hans')).toBe('行动')
    expect(morphMeaning(x, 'zh-Hant')).toBe('行動')
    expect(morphMeaning(m({ ja: '行う' }), 'ko')).toBe('行う')
    expect(morphMeaning(m({ ja: '行う', zh: '行动' }), 'zh-Hant')).toBe('行动')
  })
})

describe('一覧用の訳', () => {
  it('中国語は字形を選び、ない語は null', () => {
    const map = { run: ['跑', '經營 /经营'] }
    expect(localGloss(map, 'run', 'zh-Hant')).toEqual(['跑', '經營'])
    expect(localGloss(map, 'run', 'zh-Hans')).toEqual(['跑', '经营'])
    expect(localGloss(map, 'walk', 'zh-Hans')).toBeNull()
    expect(localGloss(undefined, 'run', 'ko')).toBeNull()
  })
})
