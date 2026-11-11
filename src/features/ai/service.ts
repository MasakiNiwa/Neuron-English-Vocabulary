import { castPrompt } from './personas'
import { complete, type ChatTurn, type IncompleteReason, type Usage } from './providers'
import { appTools, buildContext, runAppTool } from './tools'
import { resolveRoute, routeLabel } from './config'
import { getSecret, isUnlocked } from './vault'

export class AiNotReadyError extends Error {
  constructor(public reason: 'no-key' | 'locked') {
    super(reason === 'no-key' ? 'AI の API キーが設定されていません' : 'API キーのロックを解除してください')
  }
}

const BASE_SYSTEM = `あなたは英単語学習アプリ「ニューロン英単語」に組み込まれた AI です。ユーザーは日本語話者の英語学習者です。
- 日本語で、簡潔で親しみやすく答えてください。
- 単語の意味・語源・例文などの事実は、できる限りツール（get_word / get_root / search_words）でアプリの辞書を確認してから話してください。
  辞書データは自動抽出のため誤りを含むことがあります。明らかに誤っている場合はそう指摘して構いません。
- 英単語は原形のまま書くと、アプリ上でリンクになります。
- 学習の振り返り・アドバイス・計画を求められたら、get_learning_analysis でユーザーの学習の分析を確かめ、数字や単語を根拠にして具体的に答えてください。想起確率は推定なので断定しすぎず、少ない記録から決めつけないでください。
- 学習カードへの追加は、ユーザーが望んだときだけ add_to_study を使ってください。
- Markdown の見出しや表は使わず、短い段落と箇条書き程度にしてください。`

export interface RunOptions {
  messages: ChatTurn[]
  about?: string
  cast?: string[]
  extraSystem?: string
  useTools?: boolean
  onToolCall?: (name: string) => void
  /** ストリーミング表示用 */
  onText?: (delta: string) => void
  signal?: AbortSignal
}

export interface RunResult {
  text: string
  /** 記録用のモデル名（API キーの名前 / モデル） */
  model: string
  /** 消費トークン数（取得できなかった場合は undefined） */
  usage?: Usage
  /** 応答が最後まで届かなかった場合の理由（B12） */
  incomplete?: IncompleteReason
}

/** 設定した接続（会社・API キー・モデル）で LLM を呼び出す */
export async function runTask(o: RunOptions): Promise<RunResult> {
  const route = resolveRoute()
  if (!route) throw new AiNotReadyError('no-key')
  if (!isUnlocked()) throw new AiNotReadyError('locked')
  const apiKey = await getSecret(route.keyId)
  if (!apiKey) throw new AiNotReadyError('no-key')
  const context = await buildContext(o.about)
  const system = [
    BASE_SYSTEM,
    o.cast?.length ? castPrompt(o.cast) : '',
    o.extraSystem ?? '',
    `# アプリの現在の状態（JSON）\n${JSON.stringify(context)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  let usage: Usage | undefined
  let incomplete: IncompleteReason | undefined
  const text = await complete({
    provider: route.key.provider,
    apiKey,
    model: route.model,
    system,
    messages: o.messages,
    tools: o.useTools === false ? undefined : appTools,
    runTool: runAppTool,
    onToolCall: (n) => o.onToolCall?.(n),
    onText: o.onText,
    onUsage: (u) => (usage = { input: (usage?.input ?? 0) + u.input, output: (usage?.output ?? 0) + u.output }),
    onIncomplete: (r) => (incomplete = r),
    signal: o.signal,
  })
  return { text, model: routeLabel(route), usage, incomplete }
}
