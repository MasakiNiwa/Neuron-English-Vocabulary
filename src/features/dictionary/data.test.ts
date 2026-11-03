import { describe, expect, it } from 'vitest'
import { lookupWord, type Dictionary } from './data'

const dict = {
  byLower: new Map([
    ['run', 'run'],
    ['study', 'study'],
    ['make', 'make'],
    ['give up', 'give_up'],
    ['i', 'I'],
    ['hi', 'hi'],
    ['he', 'he'],
    ['she', 'she'],
    ['be', 'be'],
    ['good', 'good'],
    ['us', 'us'],
    ['use', 'use'],
    ['unit', 'unit'],
    ['unite', 'unite'],
  ]),
} as unknown as Dictionary

describe('lookupWord', () => {
  it('maps inflected forms to headwords', () => {
    expect(lookupWord(dict, 'runs')).toBe('run')
    expect(lookupWord(dict, 'running')).toBe('run')
    expect(lookupWord(dict, 'studied')).toBe('study')
    expect(lookupWord(dict, 'making')).toBe('make')
    expect(lookupWord(dict, 'Run')).toBe('run')
    expect(lookupWord(dict, 'xyz')).toBeNull()
  })
})

describe('lookupWord の誤リンク防止（B04）', () => {
  it('短すぎる語幹や不規則形を取り違えない', () => {
    expect(lookupWord(dict, 'is')).toBe('be')
    expect(lookupWord(dict, 'his')).toBe('he')
    expect(lookupWord(dict, 'her')).toBe('she')
    expect(lookupWord(dict, 'best')).toBe('good')
    expect(lookupWord(dict, 'used')).toBe('use')
    expect(lookupWord(dict, 'united')).toBe('unite')
    expect(lookupWord(dict, 'us')).toBe('us')
  })
})
