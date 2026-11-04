import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const row = (key: string, shard: string) => [key, 0, 1, '走る', ['verb'], shard, [], 0]

describe('辞書データの版の食い違い（レビュー B03）', () => {
  it('古い索引と新しいシャードが混ざったら、最新を取り直して語を返し、更新を知らせる', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        const u = new URL(url)
        const body = u.pathname.endsWith('/data/index.json')
          ? u.searchParams.has('fresh')
            ? { v: 'NEW', e: [row('run', 'w1')] } // 最新の索引では run は別のシャードへ移った
            : { v: 'OLD', e: [row('run', 'w0')] } // キャッシュに残った古い索引
          : u.pathname.endsWith('/data/morphemes.json')
            ? []
            : u.pathname.endsWith('/w0.json')
              ? { _v: 'NEW', walk: { k: 'walk' } } // サーバーには新しい w0 しかない（run はもういない）
              : { _v: 'NEW', run: { k: 'run', h: 'run' } }
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    const data = await import('./data')
    const notified = vi.fn()
    data.onDataOutdated(notified)
    const e = await data.getEntry('run')
    expect(e?.k).toBe('run')
    expect(notified).toHaveBeenCalled()
    expect(calls.some((c) => c.includes('/data/entries/w1.json?v=NEW'))).toBe(true)
  })

  it('版が一致していれば、そのまま返す（取り直さない）', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        const u = new URL(url)
        const body = u.pathname.endsWith('/data/index.json')
          ? { v: 'A', e: [row('run', 'w0')] }
          : u.pathname.endsWith('/data/morphemes.json')
            ? []
            : { _v: 'A', run: { k: 'run' } }
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    const data = await import('./data')
    expect((await data.getEntry('run'))?.k).toBe('run')
    expect(calls.some((c) => c.includes('fresh='))).toBe(false)
  })
})
