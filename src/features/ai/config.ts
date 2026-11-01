import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** AI 連携の設定（API キー本体は vault.ts で暗号化保存。ここには秘密でない情報だけを置く） */

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter'

export const PROVIDERS: Record<ProviderId, { name: string; keyUrl: string; suggested: string[] }> = {
  anthropic: {
    name: 'Claude (Anthropic)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    suggested: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
  },
  openai: {
    name: 'ChatGPT (OpenAI)',
    keyUrl: 'https://platform.openai.com/api-keys',
    suggested: ['gpt-5', 'gpt-5-mini'],
  },
  gemini: {
    name: 'Gemini (Google)',
    keyUrl: 'https://aistudio.google.com/apikey',
    suggested: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  openrouter: {
    name: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    suggested: ['openrouter/auto'],
  },
}

/** 既定のキャラクター: 解説役のニューロン先生 + 語源オタクのドクター・ルーツ */
export const DEFAULT_CAST = ['sensei', 'roots']

export interface ApiKeyEntry {
  id: string
  provider: ProviderId
  label: string
  /** このキーで使うモデル（ユーザーが登録） */
  models: string[]
}

/** 用途（タスク）ごとの割り当て先 */
export type TaskId = 'chat' | 'explain' | 'reaction' | 'generate'
export const TASKS: { id: TaskId; label: string; hint: string }[] = [
  { id: 'chat', label: 'AI チャット', hint: '会話・深掘り（高性能モデル向き）' },
  { id: 'explain', label: '単語の解説', hint: '語源の物語・覚え方の提案' },
  { id: 'reaction', label: 'リアクション', hint: '学習後のひとこと（軽量モデル向き）' },
  { id: 'generate', label: '例文・問題の生成', hint: '構造化データの生成' },
]

export interface Route {
  keyId: string
  model: string
}

/** ユーザーが作るカスタムキャラクター（1人） */
export interface CustomPersona {
  name: string
  emoji: string
  role: string
  style: string
}

interface AiConfigState {
  keys: ApiKeyEntry[]
  custom: CustomPersona | null
  setCustom: (p: CustomPersona | null) => void
  routes: Partial<Record<TaskId, Route>>
  cast: string[]
  reactionAfterStudy: boolean
  addKey: (k: ApiKeyEntry) => void
  updateKey: (id: string, patch: Partial<ApiKeyEntry>) => void
  removeKey: (id: string) => void
  setRoute: (task: TaskId, r: Route | undefined) => void
  setCast: (ids: string[]) => void
  set: (patch: Partial<Pick<AiConfigState, 'reactionAfterStudy'>>) => void
}

export const useAiConfig = create<AiConfigState>()(
  persist(
    (set) => ({
      keys: [],
      custom: null,
      setCustom: (custom) =>
        set((s) => ({ custom, cast: custom ? s.cast : s.cast.filter((c) => c !== 'custom') })),
      routes: {},
      cast: DEFAULT_CAST,
      reactionAfterStudy: true,
      addKey: (k) => set((s) => ({ keys: [...s.keys, k] })),
      updateKey: (id, patch) => set((s) => ({ keys: s.keys.map((k) => (k.id === id ? { ...k, ...patch } : k)) })),
      removeKey: (id) =>
        set((s) => ({
          keys: s.keys.filter((k) => k.id !== id),
          routes: Object.fromEntries(Object.entries(s.routes).filter(([, r]) => r?.keyId !== id)),
        })),
      setRoute: (task, r) => set((s) => ({ routes: { ...s.routes, [task]: r } })),
      setCast: (cast) => set({ cast }),
      set: (patch) => set(patch),
    }),
    {
      name: 'nev-ai',
      version: 2,
      migrate: (state, version) => {
        const s = state as { cast?: string[] }
        // v1 の既定（先生 + ミライ）のままなら新しい既定に置き換える
        if (version < 2 && s.cast?.join() === 'sensei,mirai') s.cast = DEFAULT_CAST
        return s as never
      },
    },
  ),
)

/** タスクの接続先を解決（未設定ならチャット用 → 最初に登録したモデルの順で代替） */
export function resolveRoute(task: TaskId): (Route & { key: ApiKeyEntry }) | null {
  const { keys, routes } = useAiConfig.getState()
  const pick = (r?: Route) => {
    const key = r && keys.find((k) => k.id === r.keyId)
    return key && r ? { ...r, key } : null
  }
  const first = keys.find((k) => k.models.length)
  return pick(routes[task]) ?? pick(routes.chat) ?? (first ? { keyId: first.id, model: first.models[0], key: first } : null)
}
