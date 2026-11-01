import Anthropic from '@anthropic-ai/sdk'
import type { ProviderId } from './config'

/**
 * 4 社の API を共通インターフェースで扱うアダプタ。
 *  - ツール呼び出し（function calling）のループを各社の形式に合わせて回す
 *  - onText を渡すと、応答テキストをストリーミングで逐次受け取れる
 */

export interface ToolDef {
  name: string
  description: string
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface CompleteParams {
  provider: ProviderId
  apiKey: string
  model: string
  system: string
  messages: ChatTurn[]
  tools?: ToolDef[]
  runTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>
  onToolCall?: (name: string, args: Record<string, unknown>) => void
  /** ストリーミング: 受信したテキストの差分 */
  onText?: (delta: string) => void
  signal?: AbortSignal
  maxTokens?: number
}

const MAX_ROUNDS = 6
const LIMIT_MSG = '（ツール呼び出しの上限に達しました）'

export async function complete(p: CompleteParams): Promise<string> {
  switch (p.provider) {
    case 'anthropic':
      return completeAnthropic(p)
    case 'gemini':
      return completeGemini(p)
    case 'openai':
      return completeOpenAIResponses(p)
    case 'openrouter':
      return completeOpenAICompat(p, 'https://openrouter.ai/api/v1/chat/completions', {
        'HTTP-Referer': location.origin,
        'X-Title': 'Neuron English Vocabulary',
      })
  }
}

async function exec(p: CompleteParams, name: string, args: Record<string, unknown>) {
  p.onToolCall?.(name, args)
  try {
    return JSON.stringify((await p.runTool?.(name, args)) ?? null)
  } catch (e) {
    return JSON.stringify({ error: String(e) })
  }
}

function parseArgs(s?: string): Record<string, unknown> {
  try {
    return JSON.parse(s || '{}') as Record<string, unknown>
  } catch {
    return {} // 引数が壊れていても空で実行
  }
}

/** Server-Sent Events を JSON として順に読む */
async function* readSSE(res: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        yield JSON.parse(data) as Record<string, unknown>
      } catch {
        /* 途中で切れた行は無視 */
      }
    }
  }
}

async function ensureOk(res: Response) {
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`)
}

// ---------------------------------------------------------------- Claude（公式 SDK）
/** 拒否時のサーバー側フォールバックに対応するモデル */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

async function completeAnthropic(p: CompleteParams) {
  // ユーザー自身の API キーをブラウザから直接使う（キーは暗号化保存し、通信先は Anthropic のみ）
  const client = new Anthropic({ apiKey: p.apiKey, dangerouslyAllowBrowser: true })
  const messages: Anthropic.Beta.BetaMessageParam[] = p.messages.map((m) => ({ role: m.role, content: m.content }))
  const tools: Anthropic.Beta.BetaTool[] | undefined = p.tools?.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))
  const useFallback = FALLBACK_MODELS.has(p.model)
  let all = ''
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = client.beta.messages.stream(
      {
        model: p.model,
        max_tokens: p.maxTokens ?? 16000,
        system: p.system,
        messages,
        ...(tools?.length ? { tools } : {}),
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      },
      { signal: p.signal },
    )
    stream.on('text', (d) => {
      all += d
      p.onText?.(d)
    })
    const res = await stream.finalMessage()
    if (res.stop_reason === 'refusal') return all + '（この依頼には回答できませんでした）'
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (res.stop_reason !== 'tool_use' || !uses.length) return all
    messages.push({ role: 'assistant', content: res.content as Anthropic.Beta.BetaContentBlockParam[] })
    // 並列ツール呼び出しの結果は 1 つの user メッセージにまとめて返す
    const results = await Promise.all(
      uses.map(async (u) => ({
        type: 'tool_result' as const,
        tool_use_id: u.id,
        content: await exec(p, u.name, (u.input ?? {}) as Record<string, unknown>),
      })),
    )
    messages.push({ role: 'user', content: results })
  }
  return all + LIMIT_MSG
}

// ---------------------------------------------------------------- OpenAI（Responses API）
/**
 * 新しい推論モデル（gpt-5.x など）は Chat Completions ではツールと推論を併用できないため、
 * OpenAI は Responses API を使う。ツール結果は previous_response_id で会話をつないで返す。
 */
interface RespFinal {
  id: string
  output: RespItem[]
}
interface RespItem {
  type: string
  call_id?: string
  name?: string
  arguments?: string
}

async function completeOpenAIResponses(p: CompleteParams) {
  const tools = p.tools?.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters }))
  let input: unknown[] = p.messages.map((m) => ({ role: m.role, content: m.content }))
  let previous: string | undefined
  let all = ''
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: p.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({
        model: p.model,
        instructions: p.system,
        input,
        stream: true,
        ...(previous ? { previous_response_id: previous } : {}),
        ...(tools?.length ? { tools } : {}),
      }),
    })
    await ensureOk(res)
    let final = null as RespFinal | null
    for await (const ev of readSSE(res)) {
      if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string') {
        all += ev.delta
        p.onText?.(ev.delta)
      } else if (ev.type === 'response.completed') {
        final = ev.response as RespFinal
      } else if (ev.type === 'response.failed' || ev.type === 'error') {
        throw new Error(JSON.stringify(ev).slice(0, 300))
      }
    }
    const calls = final?.output.filter((o) => o.type === 'function_call') ?? []
    if (!final || !calls.length) return all
    previous = final.id
    input = await Promise.all(
      calls.map(async (c) => ({ type: 'function_call_output', call_id: c.call_id, output: await exec(p, c.name ?? '', parseArgs(c.arguments)) })),
    )
  }
  return all + LIMIT_MSG
}

// ---------------------------------------------------------------- OpenRouter（Chat Completions 互換）
interface OAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}
interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OAIToolCall[]
  tool_call_id?: string
}

async function completeOpenAICompat(p: CompleteParams, url: string, extraHeaders: Record<string, string> = {}) {
  const messages: OAIMessage[] = [{ role: 'system', content: p.system }, ...p.messages]
  const tools = p.tools?.map((t) => ({ type: 'function', function: t }))
  let all = ''
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(url, {
      method: 'POST',
      signal: p.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}`, ...extraHeaders },
      body: JSON.stringify({ model: p.model, messages, stream: true, ...(tools?.length ? { tools } : {}) }),
    })
    await ensureOk(res)
    let text = ''
    const calls: OAIToolCall[] = []
    for await (const ev of readSSE(res)) {
      const delta = (ev.choices as { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] | undefined)?.[0]?.delta
      if (!delta) continue
      if (delta.content) {
        text += delta.content
        all += delta.content
        p.onText?.(delta.content)
      }
      // ツール呼び出しは断片で届くので index ごとに連結する
      for (const tc of delta.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } })
        if (tc.id) c.id = tc.id
        if (tc.function?.name) c.function.name += tc.function.name
        if (tc.function?.arguments) c.function.arguments += tc.function.arguments
      }
    }
    const toolCalls = calls.filter(Boolean)
    if (!toolCalls.length) return all
    messages.push({ role: 'assistant', content: text || null, tool_calls: toolCalls })
    for (const c of toolCalls) {
      messages.push({ role: 'tool', tool_call_id: c.id, content: await exec(p, c.function.name, parseArgs(c.function.arguments)) })
    }
  }
  return all + LIMIT_MSG
}

// ---------------------------------------------------------------- Gemini
interface GPart {
  text?: string
  thought?: boolean
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: unknown }
}

async function completeGemini(p: CompleteParams) {
  const contents: { role: 'user' | 'model'; parts: GPart[] }[] = p.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
  const model = p.model.replace(/^models\//, '')
  let all = ''
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal: p.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: p.system }] },
        contents,
        ...(p.tools?.length ? { tools: [{ functionDeclarations: p.tools }] } : {}),
      }),
    })
    await ensureOk(res)
    const parts: GPart[] = []
    for await (const ev of readSSE(res)) {
      const ps = (ev.candidates as { content?: { parts?: GPart[] } }[] | undefined)?.[0]?.content?.parts ?? []
      for (const x of ps) {
        parts.push(x)
        if (x.text && !x.thought) {
          all += x.text
          p.onText?.(x.text)
        }
      }
    }
    const calls = parts.filter((x) => x.functionCall)
    if (!calls.length) return all
    contents.push({ role: 'model', parts })
    const responses: GPart[] = []
    for (const c of calls) {
      const out = await exec(p, c.functionCall!.name, c.functionCall!.args ?? {})
      responses.push({ functionResponse: { name: c.functionCall!.name, response: { result: JSON.parse(out) } } })
    }
    contents.push({ role: 'user', parts: responses })
  }
  return all + LIMIT_MSG
}
