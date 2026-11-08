import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDaily, sectionOf } from './goatcounter'

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

describe('fetchDaily', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    sessionStorage.clear()
  })
  it('「その日以降の合計」の差で 1 日分を出す（境目の 0 時台を 2 日に重ねない）', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-08T03:00:00Z'), toFake: ['Date'] })
    // UTC の日ごとの数: 11/6 = 1, 11/7 = 2, 11/8 = 4（それ以降の合計を返す）
    const perDay: Record<string, number> = { '2026-11-06': 1, '2026-11-07': 2, '2026-11-08': 4 }
    vi.stubGlobal('fetch', async (url: string) => {
      const start = new URL(url).searchParams.get('start')!
      const n = Object.entries(perDay).filter(([d]) => d >= start).reduce((s, [, v]) => s + v, 0)
      return new Response(JSON.stringify({ count: String(n) }))
    })
    const out = await fetchDaily('/', 3)
    expect(out).toEqual([
      { date: '2026-11-06', count: 1 },
      { date: '2026-11-07', count: 2 },
      { date: '2026-11-08', count: 4 },
    ])
  })
})
