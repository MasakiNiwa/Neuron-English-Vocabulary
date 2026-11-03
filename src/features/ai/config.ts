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

/** 使う接続（API キーとモデル）。アプリ全体で 1 つ（チャット・追加解説の生成で共通） */
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
  route?: Route
  cast: string[]
  /** AI に学習状況（復習予定数・最近見た単語・苦手な単語）を伝えるか */
  shareLearning: boolean
  setShareLearning: (v: boolean) => void
  addKey: (k: ApiKeyEntry) => void
  updateKey: (id: string, patch: Partial<ApiKeyEntry>) => void
  removeKey: (id: string) => void
  setRoute: (r: Route | undefined) => void
  setCast: (ids: string[]) => void
}

export const useAiConfig = create<AiConfigState>()(
  persist(
    (set) => ({
      keys: [],
      custom: null,
      setCustom: (custom) =>
        set((s) => ({ custom, cast: custom ? s.cast : s.cast.filter((c) => c !== 'custom') })),
      route: undefined,
      cast: DEFAULT_CAST,
      shareLearning: true,
      setShareLearning: (shareLearning) => set({ shareLearning }),
      addKey: (k) => set((s) => ({ keys: [...s.keys, k] })),
      updateKey: (id, patch) => set((s) => ({ keys: s.keys.map((k) => (k.id === id ? { ...k, ...patch } : k)) })),
      removeKey: (id) =>
        set((s) => ({
          keys: s.keys.filter((k) => k.id !== id),
          route: s.route?.keyId === id ? undefined : s.route,
        })),
      setRoute: (route) => set({ route }),
      setCast: (cast) => set({ cast }),
    }),
    {
      name: 'nev-ai',
      version: 3,
      migrate: (state, version) => {
        const s = state as { cast?: string[]; route?: Route; routes?: Record<string, Route | undefined>; reactionAfterStudy?: boolean }
        // v1 の既定（先生 + ミライ）のままなら新しい既定に置き換える
        if (version < 2 && s.cast?.join() === 'sensei,mirai') s.cast = DEFAULT_CAST
        // v3: 用途ごとの割り当てをやめて 1 つに（チャット用の設定を引き継ぐ）。学習後のリアクションは廃止
        if (version < 3) {
          s.route = s.routes?.chat
          delete s.routes
          delete s.reactionAfterStudy
        }
        return s as never
      },
    },
  ),
)

/** 使う接続を解決（未設定・削除済みなら、最初に登録したモデル） */
export function resolveRoute(): (Route & { key: ApiKeyEntry }) | null {
  const { keys, route } = useAiConfig.getState()
  const key = route && keys.find((k) => k.id === route.keyId && k.models.includes(route.model))
  if (route && key) return { ...route, key }
  const first = keys.find((k) => k.models.length)
  return first ? { keyId: first.id, model: first.models[0], key: first } : null
}

/** 応答に記録するモデル名（API キーの名前 / モデル） */
export function routeLabel(r: Route & { key: ApiKeyEntry }) {
  return `${r.key.label} / ${r.model}`
}
