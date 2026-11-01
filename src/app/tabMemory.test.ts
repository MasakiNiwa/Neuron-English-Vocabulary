import { describe, expect, it } from 'vitest'
import { rememberLocation, tabOf, tabTarget } from './tabMemory'

describe('tabMemory', () => {
  it('単語・語根ページは単語タブ、履歴はホームタブに属する', () => {
    expect(tabOf('/e/construct')).toBe('/words')
    expect(tabOf('/m/r:spec')).toBe('/words')
    expect(tabOf('/history')).toBe('/')
    expect(tabOf('/network')).toBe('/network')
    expect(tabOf('/help')).toBeNull()
  })

  it('別のタブからは最後に見ていたページへ、同じタブ内ではタブの最初のページへ', () => {
    rememberLocation('/words', '/words?q=spec')
    rememberLocation('/e/inspect', '/e/inspect')
    expect(tabTarget('/words', '/ai')).toBe('/e/inspect')
    expect(tabTarget('/words', '/e/inspect')).toBe('/words?q=spec')
    expect(tabTarget('/words', '/words')).toBe('/words')
    expect(tabTarget('/study', '/ai')).toBe('/study')
  })
})
