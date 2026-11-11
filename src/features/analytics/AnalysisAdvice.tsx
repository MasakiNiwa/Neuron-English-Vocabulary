import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Loader2, MessageCircle, Sparkles, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { useAiConfig } from '@/features/ai/config'
import { Markdown } from '@/features/ai/Markdown'
import { ModelSelect } from '@/features/ai/ModelSelect'
import { describeAiError, INCOMPLETE_LABEL } from '@/features/ai/providers'
import { AiNotReadyError, runTask } from '@/features/ai/service'
import { createThread, touchThread, useChatUi } from '@/features/ai/threads'
import { UnlockPanel } from '@/features/ai/UnlockPanel'
import { useVault } from '@/features/ai/useVault'
import { loadDictionary } from '@/features/dictionary/data'
import { cn } from '@/lib/cn'
import { db, type AnalysisNote } from '@/lib/db'
import { trackEvent } from '@/lib/goatcounter'
import { usePersistentState } from '@/lib/persist'
import { useSettings } from '@/stores/settings'
import { buildLearningSummary } from './aiSummary'
import type { AnalyticsResult } from './compute'

/**
 * 分析ページの「AI のアドバイス」。
 * ボタンを押すと、分析ページの集計と FSRS の推定をまとめたもの（aiSummary.ts）を AI に渡して、振り返りや計画を書いてもらう。
 * 結果はタブとしてこのページに残し（新しい順に MAX_NOTES 件）、同じ内容を AI チャットの履歴にも残す（続きはチャットで聞ける）。
 * 使うモデルはここで選べる（チャットと同じ設定）
 */

const MAX_NOTES = 12

const KINDS: { kind: string; label: string; ask: string }[] = [
  {
    kind: 'overview',
    label: '全体の振り返り',
    ask: '最近の学習を振り返って、うまくいっている点・気になる点・次の一歩を教えてください。',
  },
  {
    kind: 'weak',
    label: '苦手の傾向と対策',
    ask: '最近つまずいた語や何度も忘れる語に、共通する傾向（語根・つづり・意味の似た語・出題形式など）があれば教えてください。覚え直すための具体的な対策もお願いします。',
  },
  {
    kind: 'memory',
    label: '記憶の見通し',
    ask: '今の思い出せる見込みと 7 日後の見込み、今後の復習予定から、どの語を優先して復習するとよいか、復習の量は無理がないかを教えてください。',
  },
  {
    kind: 'plan',
    label: '今週の学習プラン',
    ask: 'これまでのペースと今後 7 日の復習予定に合わせて、無理のない今週の学習プラン（1 日ごとの目安）を提案してください。',
  },
  {
    kind: 'next',
    label: '次に学ぶ語',
    ask: '学んできた語根や頻度帯のカバー率から、次に学ぶとつながりやすい語や語根を、理由と一緒に提案してください。',
  },
]

const STYLE = `# この回答の書き方
- 下の「学習のまとめ（JSON）」の数字や単語を根拠にして、具体的に書いてください。まとめにないことは推測だと分かるように書いてください。
- 想起確率は FSRS の推定です。断定しすぎず、記録が少ない項目（enoughDataForTrend が false、回答数が少ない）からは決めつけないでください。
- 短い見出し（### ）を 2〜4 個と箇条書きで、全体で 500 字前後にまとめてください。最後に、今日できる小さな一歩を 1 つ挙げてください。
- 単語の意味や成り立ちに触れるときは、ツールでアプリの辞書を確かめてください。学習カードの追加はしないでください。`

class EmptyAnswer extends Error {
  constructor() {
    super('応答が空でした。もう一度お試しください')
  }
}

const md = (t: number) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function AnalysisAdvice({ data }: { data: AnalyticsResult }) {
  const { keys, shareLearning } = useAiConfig()
  const vault = useVault()
  const setCurrent = useChatUi((s) => s.setCurrent)
  const notes = useLiveQuery(() => db.analysisNotes.orderBy('createdAt').reverse().toArray(), [])
  const [active, setActive] = usePersistentState<string | null>('analytics:adviceTab', null)
  const [busy, setBusy] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const generate = async (k: (typeof KINDS)[number]) => {
    if (abortRef.current) return
    setError('')
    setDraft('')
    setBusy(k.kind)
    const ac = new AbortController()
    abortRef.current = ac
    let threadId: string | null = null
    let partial = ''
    try {
      const [cards, { hidden }] = await Promise.all([db.cards.toArray(), loadDictionary()])
      const { desiredRetention, dailyNewLimit } = useSettings.getState()
      const summary = buildLearningSummary(data, cards.filter((c) => !hidden.has(c.entryId)), { desiredRetention, dailyNewLimit })
      trackEvent('ai-analysis')
      const res = await runTask({
        messages: [{ role: 'user', content: k.ask }],
        extraSystem: `${STYLE}\n\n# 学習のまとめ（JSON）\n${JSON.stringify(summary)}`,
        onText: (d) => {
          partial += d
          setDraft((x) => x + d)
        },
        signal: ac.signal,
      })
      if (!res.text.trim()) throw new EmptyAnswer()
      // 続きを聞けるように、AI チャットの履歴にも残す（答えが出てから作るので、失敗しても空のチャットは増えない）
      const t = await createThread(`学習の分析：${k.label}`)
      threadId = t.id
      const now = Date.now()
      await db.chats.add({ thread: t.id, role: 'user', content: k.ask, createdAt: now })
      await db.chats.add({ thread: t.id, role: 'assistant', content: res.text, createdAt: now + 1, model: res.model, usage: res.usage, incomplete: res.incomplete })
      await touchThread(t.id)
      const note: AnalysisNote = {
        id: crypto.randomUUID(),
        title: k.label,
        kind: k.kind,
        content: res.text + (res.incomplete ? `\n\n（⚠ ${INCOMPLETE_LABEL[res.incomplete]}）` : ''),
        model: res.model,
        thread: threadId,
        createdAt: now,
      }
      await db.analysisNotes.add(note)
      // 古いものから消す
      const all = await db.analysisNotes.orderBy('createdAt').reverse().toArray()
      await db.analysisNotes.bulkDelete(all.slice(MAX_NOTES).map((n) => n.id))
      setActive(note.id)
    } catch (e) {
      if (!ac.signal.aborted) setError(e instanceof AiNotReadyError || e instanceof EmptyAnswer ? e.message : describeAiError(e))
      else if (partial) setError('停止しました（途中までの内容は保存していません）')
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setBusy(null)
      setDraft('')
    }
  }

  const current = notes?.find((n) => n.id === active) ?? notes?.[0]
  // チャットの履歴を消していたら、続きを聞くリンクは出さない
  const threadAlive = useLiveQuery(async () => (current?.thread ? !!(await db.threads.get(current.thread)) : false), [current?.thread])
  const hasKeys = keys.length > 0
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-muted">
          <Sparkles className="size-4" /> AI のアドバイス
        </h2>
        {hasKeys && shareLearning && <ModelSelect className="ml-auto max-w-[60%]" />}
      </div>

      {!hasKeys ? (
        <p className="text-sm text-muted">
          <Link to="/settings" className="text-accent">
            設定で AI の API キーを登録
          </Link>
          すると、この分析をもとに AI が振り返りや学習プランを書いてくれます。
        </p>
      ) : !shareLearning ? (
        <p className="text-sm text-muted">
          学習状況を AI に共有しない設定になっています。
          <Link to="/settings" className="mx-1 text-accent">
            設定 → AI 連携
          </Link>
          で共有をオンにすると使えます。
        </p>
      ) : !vault.unlocked ? (
        <>
          <p className="mb-2 text-sm text-muted">AI のアドバイスをもらうには、API キーのロックを解除してください。</p>
          <UnlockPanel compact />
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) =>
              busy === k.kind ? (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="inline-flex items-center gap-1 rounded-full border border-accent px-3 py-1 text-xs text-accent"
                  title="作成を中止"
                >
                  <Loader2 className="size-3.5 animate-spin" /> {k.label} <Square className="ml-1 size-3 fill-current" />
                </button>
              ) : (
                <button
                  key={k.kind}
                  type="button"
                  disabled={!!busy}
                  onClick={() => void generate(k)}
                  className="rounded-full border border-accent/60 bg-accent/10 px-3 py-1 text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
                >
                  {k.label}
                </button>
              ),
            )}
            <Link to="/ai" onClick={() => setCurrent(null)} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent">
              チャットで自由に相談…
            </Link>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            分析ページの集計（回答数・割合・復習予定・つまずいた語など）と、思い出せる見込みの推定を AI に送ります。回答のメモやチャットの内容は送りません。AI
            の回答は間違うことがあります。
          </p>
        </>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {busy && (
        <div className="mt-3 rounded-xl border border-border p-3 text-sm leading-relaxed">
          {draft ? (
            <Markdown text={draft} />
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" /> 分析しています…
            </p>
          )}
        </div>
      )}

      {!busy && notes && notes.length > 0 && current && (
        <div className="mt-3">
          <div role="tablist" aria-label="AI のアドバイス" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {notes.map((n) => (
              <button
                key={n.id}
                type="button"
                role="tab"
                aria-selected={n.id === current.id}
                onClick={() => setActive(n.id)}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs',
                  n.id === current.id ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
                )}
              >
                {n.title} <span className="opacity-70">{md(n.createdAt)}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" className="mt-2 rounded-xl border border-border p-3">
            <div className="text-sm leading-relaxed">
              <Markdown text={current.content} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted">
              <span>
                {new Date(current.createdAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}
                {current.model && ` ・ ${current.model}`}
              </span>
              {current.thread && threadAlive && (
                <Link to="/ai" onClick={() => setCurrent(current.thread!)} className="inline-flex items-center gap-1 text-accent">
                  <MessageCircle className="size-3.5" /> チャットで続きを聞く
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('このアドバイスを削除しますか？（AI チャットの履歴は残ります）')) void db.analysisNotes.delete(current.id)
                }}
                className="ml-auto inline-flex items-center gap-1 hover:text-danger"
              >
                <Trash2 className="size-3.5" /> 削除
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
