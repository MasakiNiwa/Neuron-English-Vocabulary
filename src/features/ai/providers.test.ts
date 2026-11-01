// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { complete, type ToolDef } from './providers'

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
      return sse([{ choices: [{ delta: { content: 'OK' } }] }])
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
      return sse([{ candidates: [{ content: { parts: [{ text: 'こん' }] } }] }, { candidates: [{ content: { parts: [{ text: 'にちは' }] } }] }])
    }))
    const text = await complete({
      provider: 'gemini', apiKey: 'k', model: 'models/gemini-x', system: 's', messages: [{ role: 'user', content: 'q' }], tools,
      runTool: async () => 1,
    })
    expect(text).toBe('こんにちは')
  })
})
