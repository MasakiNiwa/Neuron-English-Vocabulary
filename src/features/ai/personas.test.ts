import { describe, expect, it } from 'vitest'
import { splitBySpeaker } from './personas'

describe('splitBySpeaker', () => {
  it('splits multi-character replies', () => {
    const r = splitBySpeaker('【ニューロン先生】spect は「見る」です。\n【ミライ】へえ！')
    expect(r.map((x) => x.persona?.id)).toEqual(['sensei', 'mirai'])
    expect(r[1].text).toBe('へえ！')
  })
})
