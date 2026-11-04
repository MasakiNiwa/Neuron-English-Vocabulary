import { describe, expect, it } from 'vitest'
import { markInternalAsk, takeInternalAsk } from './internalAsk'

describe('internalAsk（URL からの自動送信の防止。レビュー S01）', () => {
  it('アプリ内で目印を置いたときだけ、1 回限り true', () => {
    expect(takeInternalAsk('run', '語源を教えて')).toBe(false)
    markInternalAsk('run', '語源を教えて')
    expect(takeInternalAsk('run', '語源を教えて')).toBe(true)
    expect(takeInternalAsk('run', '語源を教えて')).toBe(false)
  })
  it('URL の内容が目印と違えば false', () => {
    markInternalAsk('run', '語源を教えて')
    expect(takeInternalAsk('run', '別の質問')).toBe(false)
  })
})
