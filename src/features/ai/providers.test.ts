// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiHttpError, complete, describeAiError, fetchRetry, type ToolDef } from './providers'

const sse = (events: unknown[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200 })

const tools: ToolDef[] = [{ name: 'get_word', description: 'd', parameters: { type: 'object', properties: { word: { type: 'string' } } } }]

afterEach(() => vi.unstubAllGlobals())

describe('providers (streaming + tools)', () => {
  it('OpenAI Responses API: tool call then streamed text', async () => {
    const bodies: Record<string, unknown>[] = []
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      if (bodies.length === 1)
        return sse([{ type: 'response.completed', response: { id: 'r1', output: [{ type: 'function_call', call_id: 'c1', name: 'get_word', arguments: '{"word":"spect"}' }] } }])
      return sse([
        { type: 'response.output_text.delta', delta: 'spect は' },
        { type: 'response.output_text.delta', delta: '「見る」' },
        { type: 'response.completed', response: { id: 'r2', output: [{ type: 'message' }] } },
      ])
    })
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []
    const called: string[] = []
    const text = await complete({
      provider: 'openai', apiKey: 'k', model: 'gpt-x', system: 's', messages: [{ role: 'user', content: 'q' }], tools,
      runTool: async (n, a) => ({ n, a }), onToolCall: (n) => called.push(n), onText: (d) => deltas.push(d),
    })
    expect(text).toBe('spect は「見る」')
    expect(deltas).toEqual(['spect は', '「見る」'])
    expect(called).toEqual(['get_word'])
    expect(bodies[1].previous_response_id).toBe('r1')
    expect((bodies[1].input as { type: string }[])[0].type).toBe('function_call_output')
  })

  it('OpenRouter: tool call arrives in fragments', async () => {
    vi.stubGlobal('location', { origin: 'https://example.com' })
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      n++
      if (n === 1)
        return sse([
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'get_', arguments: '{"wo' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'word', arguments: 'rd":"a"}' } }] } }] },
        ])
      return sse([{ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }])
    }))
    const args: unknown[] = []
    const text = await complete({
      provider: 'openrouter', apiKey: 'k', model: 'm', system: 's', messages: [{ role: 'user', content: 'q' }], tools,
      runTool: async (_n, a) => (args.push(a), 1),
    })
    expect(text).toBe('OK')
    expect(args).toEqual([{ word: 'a' }])
  })

  it('Gemini: functionCall then text', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      n++
      if (n === 1) return sse([{ candidates: [{ content: { parts: [{ functionCall: { name: 'get_word', args: { word: 'b' } } }] } }] }])
      return sse([{ candidates: [{ content: { parts: [{ text: 'こん' }] } }] }, { candidates: [{ content: { parts: [{ text: 'にちは' }] }, finishReason: 'STOP' }] }])
    }))
    const text = await complete({
      provider: 'gemini', apiKey: 'k', model: 'models/gemini-x', system: 's', messages: [{ role: 'user', content: 'q' }], tools,
      runTool: async () => 1,
    })
    expect(text).toBe('こんにちは')
  })

  it('途中で終わった応答を検出する（B12）', async () => {
    const run = async (provider: 'openai' | 'openrouter' | 'gemini', events: unknown[]) => {
      vi.stubGlobal('location', { origin: 'https://example.com' })
      vi.stubGlobal('fetch', vi.fn(async () => sse(events)))
      const reasons: string[] = []
      const text = await complete({ provider, apiKey: 'k', model: 'm', system: 's', messages: [{ role: 'user', content: 'q' }], onIncomplete: (r) => reasons.push(r) })
      return { text, reasons }
    }
    expect(await run('openai', [{ type: 'response.output_text.delta', delta: 'あ' }])).toEqual({ text: 'あ', reasons: ['interrupted'] })
    expect(
      await run('openai', [
        { type: 'response.output_text.delta', delta: 'あ' },
        { type: 'response.incomplete', response: { id: 'r', output: [], incomplete_details: { reason: 'max_output_tokens' } } },
      ]),
    ).toEqual({ text: 'あ', reasons: ['length'] })
    expect(await run('openrouter', [{ choices: [{ delta: { content: 'い' }, finish_reason: 'length' }] }])).toEqual({ text: 'い', reasons: ['length'] })
    expect(await run('openrouter', [{ choices: [{ delta: { content: 'い' } }] }])).toEqual({ text: 'い', reasons: ['interrupted'] })
    expect(await run('gemini', [{ candidates: [{ content: { parts: [{ text: 'う' }] }, finishReason: 'SAFETY' }] }])).toEqual({ text: 'う', reasons: ['filtered'] })
    expect(await run('gemini', [{ candidates: [{ content: { parts: [{ text: 'う' }] }, finishReason: 'STOP' }] }])).toEqual({ text: 'う', reasons: [] })
  })
})

describe('一時的なエラーのやり直しと説明', () => {
  it('429・503 は待ってやり直し、成功すればその応答を返す', async () => {
    const calls: number[] = []
    const seq = [429, 503, 200]
    vi.stubGlobal('fetch', async () => {
      const st = seq[calls.length]
      calls.push(st)
      return new Response('x', { status: st })
    })
    const res = await fetchRetry('https://example.com', {}, [1, 1])
    expect(res.status).toBe(200)
    expect(calls).toEqual([429, 503, 200])
    vi.unstubAllGlobals()
  })
  it('400 などはやり直さない。回数を使い切ったら最後の応答を返す', async () => {
    let n = 0
    vi.stubGlobal('fetch', async () => (n++, new Response('x', { status: 400 })))
    expect((await fetchRetry('https://example.com', {}, [1, 1])).status).toBe(400)
    expect(n).toBe(1)
    n = 0
    vi.stubGlobal('fetch', async () => (n++, new Response('x', { status: 503 })))
    expect((await fetchRetry('https://example.com', {}, [1, 1])).status).toBe(503)
    expect(n).toBe(3)
    vi.unstubAllGlobals()
  })
  it('状態コードごとに次の行動が分かる説明にする', () => {
    expect(describeAiError(new AiHttpError(429, 'RESOURCE_EXHAUSTED'))).toContain('無料枠')
    expect(describeAiError(new AiHttpError(503, 'overloaded'))).toContain('混雑')
    expect(describeAiError(new AiHttpError(401, ''))).toContain('API キー')
    expect(describeAiError(new TypeError('Failed to fetch'))).toContain('通信エラー')
  })
})
