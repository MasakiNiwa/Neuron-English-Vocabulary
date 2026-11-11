import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { capturePage } from './screenshot'

const { domToBlob } = vi.hoisted(() => ({ domToBlob: vi.fn() }))
vi.mock('modern-screenshot', () => ({ domToBlob }))
vi.mock('@/stores/settings', () => ({ useSettings: { getState: () => ({ screenshotChrome: true, screenshotFormat: 'png' }) } }))

beforeEach(() => {
  document.body.innerHTML = '<div id="app-shell"><main style="padding-bottom: 80px"><div id="scroll" style="height: 40px; overflow-y: auto">conversation</div><span id="inline">text</span></main></div>'
  for (const id of ['scroll', 'inline']) {
    Object.defineProperty(document.getElementById(id), 'scrollHeight', { value: 200 })
    Object.defineProperty(document.getElementById(id), 'clientHeight', { value: 40 })
  }
  const root = document.getElementById('app-shell')!
  Object.defineProperty(root, 'scrollWidth', { value: 400 })
  Object.defineProperty(root, 'scrollHeight', { value: 100000 })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  domToBlob.mockReset().mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('capturePage', () => {
  it('expands scrolling content, preserves ordinary text, respects canvas limits and restores styles', async () => {
    const before = document.body.innerHTML
    domToBlob.mockImplementation(async (_root, options) => {
      expect(document.getElementById('scroll')!.style.height).toBe('auto')
      expect(document.getElementById('inline')!.getAttribute('style')).toBeNull()
      expect(options.height * options.scale).toBeLessThanOrEqual(32000)
      expect(options.height * options.width * options.scale ** 2).toBeLessThanOrEqual(16000000)
      const pair = document.createElement('span')
      pair.setAttribute('data-screenshot-word-pair', '')
      pair.style.width = '99.123px'
      pair.innerHTML = '<a style="width: 50.1px">train</a><span style="width: 49.023px">電車</span>'
      options.onCloneEachNode(pair)
      expect(pair.style.width).toBe('auto')
      expect((pair.firstElementChild as HTMLElement).style.width).toBe('auto')
      return new Blob(['image'])
    })
    await capturePage()
    expect(document.body.innerHTML).toBe(before)
    expect(document.documentElement.classList.contains('nev-capturing')).toBe(false)
  })

  it('waits for fonts and prevents overlapping capture/restoration', async () => {
    let ready!: () => void
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise<void>((r) => { ready = r }) } })
    const capture = capturePage()
    await expect(capturePage()).rejects.toThrow('already in progress')
    expect(domToBlob).not.toHaveBeenCalled()
    ready()
    await capture
    expect(domToBlob).toHaveBeenCalledOnce()
  })

  it('restores the page after renderer failure and allows a retry', async () => {
    const before = document.body.innerHTML
    domToBlob.mockRejectedValueOnce(new Error('render failed'))
    await expect(capturePage()).rejects.toThrow('render failed')
    expect(document.body.innerHTML).toBe(before)
    expect(document.documentElement.classList.contains('nev-capturing')).toBe(false)
    await expect(capturePage()).resolves.toBeInstanceOf(Blob)
  })

  it('bounds font waiting and restores the page on timeout', async () => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise(() => {}) } })
    const before = document.body.innerHTML
    const result = expect(capturePage()).rejects.toThrow('fonts are still loading')
    await vi.advanceTimersByTimeAsync(5100)
    await result
    expect(document.body.innerHTML).toBe(before)
    expect(document.documentElement.classList.contains('nev-capturing')).toBe(false)
    Object.defineProperty(document, 'fonts', { configurable: true, value: undefined })
  })
})
