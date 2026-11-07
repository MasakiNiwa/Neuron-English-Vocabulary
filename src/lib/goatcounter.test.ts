import { describe, expect, it } from 'vitest'
import { sectionOf } from './goatcounter'

describe('sectionOf', () => {
  it('単語名や ID を含めず、画面の種類にまとめる', () => {
    expect(sectionOf('/')).toBe('/')
    expect(sectionOf('/e/abandon')).toBe('/word')
    expect(sectionOf('/m/123')).toBe('/morpheme')
    expect(sectionOf('/lesson/spect')).toBe('/lesson')
    expect(sectionOf('/study')).toBe('/study')
    expect(sectionOf('/ai')).toBe('/ai')
    expect(sectionOf('/help')).toBe('/help')
  })
  it('知らないパスは /other にする', () => {
    expect(sectionOf('/unknown/secret')).toBe('/other')
  })
})
