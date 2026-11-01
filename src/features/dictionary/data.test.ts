import { describe, expect, it } from 'vitest'
import { lookupWord, type Dictionary } from './data'

const dict = {
  byLower: new Map([
    ['run', 'run'],
    ['study', 'study'],
    ['make', 'make'],
    ['give up', 'give_up'],
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
