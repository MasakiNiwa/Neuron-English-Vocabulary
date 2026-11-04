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
