import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSpeechCheck } from './useSpeechCheck'

type Fake = { onresult: ((e: unknown) => void) | null; onerror: ((e: unknown) => void) | null; onend: (() => void) | null }

function setup() {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const instances: Fake[] = []
  class FakeSR {
    onresult = null
    onerror = null
    onend = null
    constructor() {
      instances.push(this as unknown as Fake)
    }
    start() {}
    stop() {}
    abort() {}
  }
  vi.stubGlobal('SpeechRecognition', FakeSR)
  return instances
}

afterEach(() => vi.unstubAllGlobals())

describe('useSpeechCheck（レビュー B02）', () => {
  it('古い認識器のエラーが、新しく始めた聞き取りの状態を変えない', async () => {
    const instances = setup()
    const el = document.createElement('div')
    const root = createRoot(el)
    let hook!: ReturnType<typeof useSpeechCheck>
    function Probe() {
      hook = useSpeechCheck('apple')
      return <span>{hook.state.phase}</span>
    }
    await act(async () => root.render(<Probe />))
    const first = instances.length
    await act(async () => hook.start())
    const old = instances[first]
    await act(async () => hook.start())
    expect(el.textContent).toBe('listening')
    // 古い認識器のハンドラは外れている（届いても何も起きない）
    await act(async () => old.onerror?.({ error: 'aborted' }))
    expect(el.textContent).toBe('listening')
    await act(async () => root.unmount())
  })

  it('お手本が変わったあとに、前のお手本の結果が届かない', async () => {
    const instances = setup()
    const el = document.createElement('div')
    const root = createRoot(el)
    const called = vi.fn()
    let hook!: ReturnType<typeof useSpeechCheck>
    function Probe({ target }: { target: string }) {
      hook = useSpeechCheck(target, called)
      return <span>{hook.state.phase}</span>
    }
    await act(async () => root.render(<Probe target="apple" />))
    const first = instances.length
    await act(async () => hook.start())
    const rec = instances[first]
    const result = Object.assign([{ transcript: 'apple' }], { isFinal: true })
    const onresult = rec.onresult
    const onend = rec.onend
    await act(async () => onresult?.({ results: [result] }))
    await act(async () => root.render(<Probe target="banana" />))
    // 古いハンドラを直接呼んでも、新しいお手本には届かない
    await act(async () => onend?.())
    expect(called).not.toHaveBeenCalled()
    expect(el.textContent).toBe('idle')
    await act(async () => root.unmount())
  })
})
