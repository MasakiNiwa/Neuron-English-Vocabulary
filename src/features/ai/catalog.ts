import Anthropic from '@anthropic-ai/sdk'
import { kvGet, kvSet } from '@/lib/db'
import type { ProviderId } from './config'

/** モデル選択画面で表示するモデル情報（取得できる範囲で） */
export interface ModelInfo {
  id: string
  name?: string
  description?: string
  /** 入力コンテキスト長（トークン） */
  context?: number
  maxOutput?: number
  /** 公開日 (ms) */
  created?: number
  /** USD / 100万トークン */
  inputPrice?: number
  outputPrice?: number
  /** 価格が API 由来でなく参考値の場合 true */
  priceIsReference?: boolean
  /** チャット用途でない（埋め込み・音声・画像など） */
  nonChat?: boolean
}

/** API から価格が取れない会社向けの参考価格（USD / 100万トークン、変更される場合あり） */
const REFERENCE_PRICES: Record<string, [number, number]> = {
  'claude-fable-5-1': [10, 50],
  'claude-fable-5': [10, 50],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-opus-4-7': [5, 25],
  'claude-opus-4-6': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-haiku-4-5': [1, 5],
}

const NON_CHAT = /(embed|embedding|tts|whisper|transcribe|dall-e|image|imagen|veo|audio|moderation|realtime|search-preview|davinci|babbage|aqa|computer-use|sora|speech)/i

function withReference(m: ModelInfo): ModelInfo {
  const ref = REFERENCE_PRICES[m.id]
  if (ref && m.inputPrice === undefined) return { ...m, inputPrice: ref[0], outputPrice: ref[1], priceIsReference: true }
  return m
}

export async function fetchCatalog(provider: ProviderId, apiKey: string): Promise<ModelInfo[]> {
  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    const out: ModelInfo[] = []
    for await (const m of client.models.list()) {
      const x = m as typeof m & { max_input_tokens?: number; max_tokens?: number }
      out.push(withReference({ id: m.id, name: m.display_name, created: Date.parse(m.created_at), context: x.max_input_tokens, maxOutput: x.max_tokens }))
    }
    return out
  }
  if (provider === 'gemini') {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': apiKey } })
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`)
    const j = (await res.json()) as {
      models: { name: string; displayName?: string; description?: string; inputTokenLimit?: number; outputTokenLimit?: number; supportedGenerationMethods?: string[] }[]
    }
    return j.models.map((m) => ({
      id: m.name.replace(/^models\//, ''),
      name: m.displayName,
      description: m.description,
      context: m.inputTokenLimit,
      maxOutput: m.outputTokenLimit,
      nonChat: !m.supportedGenerationMethods?.includes('generateContent') || NON_CHAT.test(m.name),
    }))
  }
  if (provider === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) throw new Error(`${res.status}`)
    const j = (await res.json()) as {
      data: { id: string; name?: string; description?: string; context_length?: number; created?: number; pricing?: { prompt?: string; completion?: string }; top_provider?: { max_completion_tokens?: number }; architecture?: { output_modalities?: string[] } }[]
    }
    const price = (v?: string) => (v === undefined || Number(v) < 0 ? undefined : Number(v) * 1e6)
    return j.data.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      context: m.context_length,
      maxOutput: m.top_provider?.max_completion_tokens,
      created: m.created ? m.created * 1000 : undefined,
      inputPrice: price(m.pricing?.prompt),
      outputPrice: price(m.pricing?.completion),
      nonChat: m.architecture?.output_modalities ? !m.architecture.output_modalities.includes('text') : false,
    }))
  }
  const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = (await res.json()) as { data: { id: string; created?: number; owned_by?: string }[] }
  return j.data.map((m) => ({ id: m.id, created: m.created ? m.created * 1000 : undefined, nonChat: NON_CHAT.test(m.id) }))
}

/** 取得したモデル一覧は API キーごとにキャッシュ（モデル一覧の取得は毎回不要） */
export interface CachedCatalog {
  fetchedAt: number
  models: ModelInfo[]
}
export const getCachedCatalog = (keyId: string) => kvGet<CachedCatalog>(`models:${keyId}`)
export const setCachedCatalog = (keyId: string, models: ModelInfo[]) => kvSet(`models:${keyId}`, { fetchedAt: Date.now(), models })

export function suggestedInfo(ids: string[]): ModelInfo[] {
  return ids.map((id) => withReference({ id }))
}

export function formatTokens(n?: number) {
  if (!n) return null
  return n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`
}
export function formatPrice(n?: number) {
  if (n === undefined) return null
  if (n === 0) return '無料'
  return `$${n < 1 ? +n.toFixed(3) : +n.toFixed(2)}`
}
