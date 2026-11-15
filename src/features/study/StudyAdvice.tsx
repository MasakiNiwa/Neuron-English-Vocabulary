import { Link } from '@tanstack/react-router'
import { trackEvent } from '@/lib/goatcounter'
import { Loader2, MessageCircle, Sparkles, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { db } from '@/lib/db'
import { useAiConfig } from '@/features/ai/config'
import { Markdown } from '@/features/ai/Markdown'
import { ModelSelect } from '@/features/ai/ModelSelect'
import { describeAiError, INCOMPLETE_LABEL } from '@/features/ai/providers'
import { AiNotReadyError, runTask } from '@/features/ai/service'
import { createThread, touchThread, useChatUi } from '@/features/ai/threads'
import { UnlockPanel } from '@/features/ai/UnlockPanel'
import { useVault } from '@/features/ai/useVault'

/**
 * 答えを見たあとの「AI にアドバイスをもらう」。
 * 学習の流れを止めないよう、アドバイスはカードの下に表示し、同じ内容を AI チャットの履歴にも残す（続きはチャットで聞ける）。
 * 使うモデルは、頼む前にここで選べる（チャットと同じ設定）
 */
export default function StudyAdvice({ about, title, prompt }: { about: string; title: string; prompt: () => string }) {
  const { keys } = useAiConfig()
  const vault = useVault()
  const setCurrent = useChatUi((s) => s.setCurrent)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [incomplete, setIncomplete] = useState<string | undefined>()
  // AI に聞きたいこと（任意）。「〜との違いが分からない」など
  const [question, setQuestion] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  // このスレッドに AI の答えが入ったか（失敗したときのやり直しで同じスレッドを使うため）
  const answeredRef = useRef(false)
  // カードを評価して次へ進んだら（この部品が消えたら）生成を止める。途中までの内容は履歴に残る
  useEffect(() => () => abortRef.current?.abort(), [])

  if (!keys.length)
    return (
      <p className="text-center text-[11px] text-muted">
        <Link to="/settings" className="text-accent">
          設定で AI の API キーを登録
        </Link>
        すると、答え合わせのアドバイスをもらえます
      </p>
    )

  const ask = async () => {
    if (busy) return
    setError('')
    setText('')
    setIncomplete(undefined)
    setBusy(true)
    const ac = new AbortController()
    abortRef.current = ac
    const q = question.trim()
    const content = q ? `${prompt()}\n\n# 特に聞きたいこと\n${q}\nこの質問に、まずはっきり答えてください。` : prompt()
    let partial = ''
    let tid: string | null = null
    try {
      // 前回が失敗して答えがないなら、同じスレッドでやり直す（履歴に空のチャットを増やさない）。質問を書き直したときは新しく
      const reuse = threadId && !answeredRef.current && !q ? await db.threads.get(threadId) : undefined
      const t = reuse ?? (await createThread(title, about))
      tid = t.id
      setThreadId(t.id)
      if (!reuse) await db.chats.add({ thread: t.id, role: 'user', content, createdAt: Date.now() })
      answeredRef.current = false
      trackEvent('ai-advice')
      const res = await runTask({
        messages: [{ role: 'user', content }],
        about,
        onText: (d) => {
          partial += d
          setText((x) => x + d)
        },
        signal: ac.signal,
      })
      setText(res.text)
      setIncomplete(res.incomplete && INCOMPLETE_LABEL[res.incomplete])
      answeredRef.current = true
      await db.chats.add({ thread: t.id, role: 'assistant', content: res.text || '（応答が空でした）', createdAt: Date.now(), model: res.model, usage: res.usage, incomplete: res.incomplete })
      await touchThread(t.id)
    } catch (e) {
      if (ac.signal.aborted) {
        if (tid && partial) answeredRef.current = true
        if (tid && partial) await db.chats.add({ thread: tid, role: 'assistant', content: partial + '\n\n（停止しました）', createdAt: Date.now() })
        return
      }
      setError(e instanceof AiNotReadyError ? e.message : describeAiError(e))
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-2.5 text-left">
      {!vault.unlocked ? (
        <>
          <p className="text-xs text-muted">AI のアドバイスをもらうには、API キーのロックを解除してください。</p>
          <UnlockPanel compact />
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">AI に聞きたいこと（任意）</span>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={busy}
              rows={2}
              maxLength={500}
              placeholder="例: ○○との使い分けが分からない／なぜこの訳になるの？"
              className="min-h-14 resize-y rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {busy ? (
              <Button size="sm" onClick={() => abortRef.current?.abort()}>
                <Square className="size-3 fill-current" /> 停止
              </Button>
            ) : (
              <Button size="sm" onClick={() => void ask()}>
                <Sparkles className="size-4" /> {error ? 'もう一度試す' : threadId ? 'もう一度アドバイスをもらう' : 'AI にアドバイスをもらう'}
              </Button>
            )}
            <ModelSelect className="max-w-[55vw] sm:max-w-xs" />
          </div>
          {busy && !text && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" /> 考え中…
            </p>
          )}
          {text && (
            <div className="text-sm leading-relaxed">
              <Markdown text={text} />
            </div>
          )}
          {incomplete && <p className="rounded-lg bg-warn/10 px-2 py-1 text-xs text-warn">⚠ {incomplete}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
          {threadId && !busy && (
            <Link to="/ai" onClick={() => setCurrent(threadId)} className="inline-flex items-center gap-1 self-start text-xs text-accent">
              <MessageCircle className="size-3.5" /> AI チャットで続きを聞く（履歴に保存しました）
            </Link>
          )}
          <p className="text-[10px] text-muted">問題・正解・あなたの答え（メモを含む）と、聞きたいことを AI に送ります。AI の回答は間違うことがあります。</p>
        </>
      )}
    </div>
  )
}
