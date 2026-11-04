import { describe, expect, it } from 'vitest'
import { grade, scoreAttempt, scoreOne, tokenize } from './pronounce'

describe('pronounce', () => {
  it('短縮形・数字・記号をそろえて比べる', () => {
    expect(tokenize("Don't stop, it's 2 o'clock!").map((t) => t.norm)).toEqual(['do', 'not', 'stop', 'it', 'is', 'two', 'oclock'])
    expect(scoreOne("I don't know.", 'i do not know').score).toBe(100)
  })

  it('単語ごとに一致・おしい・抜けを判定する', () => {
    const r = scoreOne('This right must be protected', 'this right must be protect')
    expect(r.words.map((w) => w.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'close'])
    expect(r.score).toBe(90)
    const r2 = scoreOne('She sells sea shells', 'she sea shells')
    expect(r2.words.map((w) => w.status)).toEqual(['ok', 'miss', 'ok', 'ok'])
  })

  it('候補の中から最も点が高いものを採り、1 語なら含まれていれば正解', () => {
    expect(scoreAttempt('light', ['right', 'light']).score).toBe(100)
    expect(scoreAttempt('light', ['the word light']).score).toBe(100)
    expect(scoreAttempt('light', ['right']).score).toBeLessThan(75)
    expect(scoreAttempt('protect', []).score).toBe(0)
  })

  it('段階', () => {
    expect(grade(100)).toBe('perfect')
    expect(grade(80)).toBe('good')
    expect(grade(50)).toBe('close')
    expect(grade(10)).toBe('retry')
  })
})
