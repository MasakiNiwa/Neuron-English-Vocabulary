import { describe, expect, it } from 'vitest'
import type { Entry, IndexEntry } from '@/features/dictionary/types'
import { buildChoices, glossWords } from './choices'

const ix = (key: string, rank: number, gloss: string): IndexEntry => ({ key, type: 'w', rank, gloss, pos: ['adv'], shard: 'w0', morphs: [], hasNote: false })

describe('buildChoices', () => {
  const entries = [
    ix('maybe', 100, 'たぶん、もしかすると'),
    ix('perhaps', 110, 'たぶん、おそらく'),
    ix('possibly', 120, 'ひょっとしたら'),
    ix('run', 130, '走る'),
    ix('eat', 140, '食べる'),
    ix('eat2', 150, '食べる'),
    ix('see', 160, '見る'),
  ]
  const maybe = { k: 'maybe', h: 'maybe', t: 'w', r: 100, g: [{ p: 'adv', ja: ['たぶん', 'もしかすると'] }], syn: ['possibly'] } as Entry

  it('正解と同じ訳を含む語・類義語・重複した訳を誤答にしない', () => {
    for (let i = 0; i < 20; i++) {
      const c = buildChoices(maybe, entries)
      const texts = c.map((x) => x.text)
      expect(c.filter((x) => x.correct)).toHaveLength(1)
      expect(texts).not.toContain('たぶん、おそらく')
      expect(texts).not.toContain('ひょっとしたら')
      expect(new Set(texts).size).toBe(texts.length)
      expect(c).toHaveLength(4)
    }
  })

  it('候補が足りなくても止まらない', () => {
    const c = buildChoices(maybe, entries.slice(0, 3))
    expect(c).toEqual([{ text: 'たぶん、もしかすると', correct: true }])
  })

  it('glossWords は括弧・〜を外す', () => {
    expect(glossWords('〜へ、(人を)導く・案内する')).toEqual(['へ', '導く', '案内する'])
  })
})
