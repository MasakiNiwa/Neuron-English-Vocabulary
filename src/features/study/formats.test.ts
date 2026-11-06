import { describe, expect, it } from 'vitest'
import type { Entry } from '@/features/dictionary/types'
import { findCloze } from './formats'

const entry = (h: string, forms: string[], en: string) => ({ k: h.replace(/ /g, '_'), h, t: 'p', r: 1, g: [], forms, ex: [{ en, ja: '', id: 1 }] }) as unknown as Entry

describe('findCloze（熟語。ROADMAP C06）', () => {
  it('熟語の活用形でも穴埋めの位置が分かる', () => {
    const c = findCloze(entry('take place', ['takes place', 'took place', 'taken place'], 'A great revolution has taken place in technology.'))
    expect(c && c.ex.en.slice(c.start, c.end)).toBe('taken place')
  })
  it('ハイフンでつながっていても見つける', () => {
    const c = findCloze(entry('state of the art', [], 'the state-of-the-art research'))
    expect(c && c.ex.en.slice(c.start, c.end)).toBe('state-of-the-art')
  })
})

import { migrateFormat, pickFormat } from './formats'

describe('出題形式の選び方', () => {
  const e = entry('run', [], 'I run every day.')
  const noEx = { ...e, ex: [] } as unknown as Entry
  it('以前の単一選択の設定を複数選択に移す', () => {
    expect(migrateFormat('mix')).toEqual(['en2ja', 'choice', 'ja2en', 'cloze'])
    expect(migrateFormat('ja2speak')).toEqual(['ja2en'])
    expect(migrateFormat('cloze')).toEqual(['cloze'])
    expect(migrateFormat('bad')).toEqual(['en2ja'])
  })
  it('例文がない語では穴埋めを出さない', () => {
    for (let i = 0; i < 20; i++) expect(pickFormat(['cloze', 'ja2en'], false, noEx, null)).toBe('ja2en')
    expect(pickFormat(['cloze'], false, noEx, null)).toBe('en2ja')
  })
  it('おまかせ: 新しい語は意味を答える形式、覚えてきた語は英語を答える形式を中心に出す', () => {
    const count = (card: { state: number; stability: number }) => {
      let rec = 0
      let r = 0.137
      const rnd = () => (r = (r * 9301 + 49297) % 233280 / 233280)
      for (let i = 0; i < 400; i++) {
        const f = pickFormat(['en2ja', 'choice', 'ja2en', 'cloze'], true, e, card, rnd)
        if (f === 'en2ja' || f === 'choice') rec++
      }
      return rec
    }
    expect(count({ state: 0, stability: 0 })).toBeGreaterThan(count({ state: 2, stability: 30 }))
  })
  it('おまかせでなければ選んだ形式から選ぶ', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) seen.add(pickFormat(['en2ja', 'ja2en'], false, e, { state: 0, stability: 0 }))
    expect([...seen].sort()).toEqual(['en2ja', 'ja2en'])
  })
})
