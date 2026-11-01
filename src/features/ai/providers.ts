import Anthropic from '@anthropic-ai/sdk'
import type { ProviderId } from './config'

/**
 * 4 社の API を共通インターフェースで扱うアダプタ。
 * ツール呼び出し（function calling）のループもここで各社の形式に合わせて回す。
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
  signal?: AbortSignal
  maxTokens?: number
}

const MAX_ROUNDS = 6

export async function complete(p: CompleteParams): Promise<string> {
  switch (p.provider) {
    case 'anthropic':
      return completeAnthropic(p)
    case 'gemini':
      return completeGemini(p)
    case 'openai':
      return completeOpenAICompat(p, 'https://api.openai.com/v1/chat/completions')
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
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await client.beta.messages.create(
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
    if (res.stop_reason === 'refusal') return '（この依頼には回答できませんでした）'
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (res.stop_reason !== 'tool_use' || !uses.length) return text
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
  return '（ツール呼び出しの上限に達しました）'
}

// ---------------------------------------------------------------- OpenAI / OpenRouter
interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

async function completeOpenAICompat(p: CompleteParams, url: string, extraHeaders: Record<string, string> = {}) {
  const messages: OAIMessage[] = [{ role: 'system', content: p.system }, ...p.messages]
  const tools = p.tools?.map((t) => ({ type: 'function', function: t }))
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(url, {
      method: 'POST',
      signal: p.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}`, ...extraHeaders },
      body: JSON.stringify({ model: p.model, messages, ...(tools?.length ? { tools } : {}) }),
    })
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = (await res.json()) as { choices: { message: OAIMessage }[] }
    const msg = json.choices[0].message
    if (!msg.tool_calls?.length) return msg.content ?? ''
    messages.push(msg)
    for (const c of msg.tool_calls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(c.function.arguments || '{}')
      } catch {
        /* 引数が壊れていても空で実行 */
      }
      messages.push({ role: 'tool', tool_call_id: c.id, content: await exec(p, c.function.name, args) })
    }
  }
  return '（ツール呼び出しの上限に達しました）'
}

// ---------------------------------------------------------------- Gemini
interface GPart {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: unknown }
}

async function completeGemini(p: CompleteParams) {
  const contents: { role: 'user' | 'model'; parts: GPart[] }[] = p.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
  const model = p.model.replace(/^models\//, '')
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal: p.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: p.system }] },
        contents,
        ...(p.tools?.length ? { tools: [{ functionDeclarations: p.tools }] } : {}),
      }),
    })
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = (await res.json()) as { candidates?: { content?: { parts?: GPart[] } }[] }
    const parts = json.candidates?.[0]?.content?.parts ?? []
    const calls = parts.filter((x) => x.functionCall)
    if (!calls.length) return parts.map((x) => x.text ?? '').join('')
    contents.push({ role: 'model', parts })
    const responses: GPart[] = []
    for (const c of calls) {
      const out = await exec(p, c.functionCall!.name, c.functionCall!.args ?? {})
      responses.push({ functionResponse: { name: c.functionCall!.name, response: { result: JSON.parse(out) } } })
    }
    contents.push({ role: 'user', parts: responses })
  }
  return '（ツール呼び出しの上限に達しました）'
}

// ---------------------------------------------------------------- モデル一覧
export async function listModels(provider: ProviderId, apiKey: string): Promise<string[]> {
  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    const ids: string[] = []
    for await (const m of client.models.list()) ids.push(m.id)
    return ids
  }
  if (provider === 'gemini') {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': apiKey },
    })
    if (!res.ok) throw new Error(`${res.status}`)
    const j = (await res.json()) as { models: { name: string; supportedGenerationMethods?: string[] }[] }
    return j.models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
  }
  const url = provider === 'openai' ? 'https://api.openai.com/v1/models' : 'https://openrouter.ai/api/v1/models'
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!res.ok) throw new Error(`${res.status}`)
  const j = (await res.json()) as { data: { id: string }[] }
  return j.data.map((m) => m.id).sort()
}
