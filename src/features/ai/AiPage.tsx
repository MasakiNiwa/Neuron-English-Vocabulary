import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { History, Loader2, MessageSquarePlus, Mic, Send, Settings, Square, Trash2, Volume2, Wrench } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { db, type ChatRecord, type ChatThread } from '@/lib/db'
import { getSpeechRecognition } from '@/lib/speech'
import { headword } from '@/features/dictionary/data'
import { LinkedText } from '@/features/dictionary/components/links'
import { useAiConfig } from './config'
import { personaById, splitBySpeaker, usePersonas } from './personas'
import { createThread, deleteAllThreads, deleteThread, MAX_THREADS, touchThread, useChatUi } from './threads'
import type { AiSearch } from './search'
import { AiNotReadyError, runTask } from './service'
import { UnlockPanel } from './UnlockPanel'
import { useVault } from './useVault'


function speakJa(text: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/【[^】]+】/g, ''))
  u.lang = 'ja-JP'
  speechSynthesis.speak(u)
}

/** 日本語の文中にある英単語をリンク化（LinkedText は英字部分だけを判定する） */
function Bubble({ m, live }: { m: ChatRecord; live?: boolean }) {
  if (m.role === 'user')
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-fg">{m.content}</div>
      </div>
    )
  const parts = splitBySpeaker(m.content)
  return (
    <div className="flex flex-col gap-2">
      {m.tools?.length ? (
        <div className="flex flex-wrap gap-1">
          {m.tools.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
              <Wrench className="size-3" /> {t}
            </span>
          ))}
        </div>
      ) : null}
      {parts.map((p, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-base" title={p.persona?.name}>
            {p.persona?.emoji ?? '🤖'}
          </span>
          <div className="min-w-0 flex-1">
            {p.persona && <div className="mb-0.5 text-[11px] text-muted">{p.persona.name}</div>}
            <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-border bg-surface px-3.5 py-2 text-sm leading-relaxed">
              <LinkedText text={p.text} />
            </div>
          </div>
        </div>
      ))}
      {!live && <div className="flex items-center gap-2 pl-10 text-[10px] text-muted">
        <button type="button" onClick={() => speakJa(m.content)} className="hover:text-accent" aria-label="読み上げ">
          <Volume2 className="size-3.5" />
        </button>
        {m.model}
      </div>}
    </div>
  )
}

function HistoryPanel({ current, onPick, onClose }: { current: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const threads = useLiveQuery(() => db.threads.orderBy('updatedAt').reverse().toArray(), [])
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">
          チャット履歴 <span className="text-xs font-normal text-muted">{threads?.length ?? 0} / {MAX_THREADS} 件</span>
        </span>
        <div className="flex items-center gap-2">
          {!!threads?.length && (
            <button
              type="button"
              className="text-xs text-muted hover:text-danger"
              onClick={async () => {
                if (confirm('すべてのチャット履歴を削除しますか？')) {
                  await deleteAllThreads()
                  onPick('')
                }
              }}
            >
              すべて削除
            </button>
          )}
          <button type="button" className="text-xs text-muted hover:text-fg" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
      {threads?.length === 0 && <p className="p-3 text-sm text-muted">まだ履歴はありません。</p>}
      <ul className="max-h-72 divide-y divide-border overflow-auto">
        {threads?.map((t) => (
          <li key={t.id} className={'flex items-center gap-2 px-3 py-2 ' + (t.id === current ? 'bg-accent-soft/60' : '')}>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onPick(t.id)}>
              <div className="truncate text-sm">{t.title}</div>
              <div className="text-[11px] text-muted">
                {new Date(t.updatedAt).toLocaleString()}
                {t.about && ` ・ ${headword(t.about)}`}
              </div>
            </button>
            <button
              type="button"
              aria-label="削除"
              className="shrink-0 text-muted hover:text-danger"
              onClick={async () => {
                await deleteThread(t.id)
                if (t.id === current) onPick('')
              }}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ChatView() {
  const search = useSearch({ from: '/ai' }) as AiSearch
  const navigate = useNavigate()
  const { keys, cast, setCast } = useAiConfig()
  const personas = usePersonas()
  const vault = useVault()
  const current = useChatUi((s) => s.current)
  const setCurrent = useChatUi((s) => s.setCurrent)
  const thread = useLiveQuery(async () => (current ? ((await db.threads.get(current)) ?? null) : null), [current])
  const messages = useLiveQuery(async () => (current ? db.chats.where('thread').equals(current).sortBy('createdAt') : []), [current])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [tools, setTools] = useState<string[]>([])
  const [streaming, setStreaming] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const handledParams = useRef<string | null>(null)

  useEffect(() => {
    void bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages?.length, busy])

  /** メッセージを送信（threadOverride: 新しく作ったスレッドに送る場合） */
  const send = async (text: string, threadOverride?: ChatThread) => {
    const content = text.trim()
    if (!content || busy) return
    setError('')
    setInput('')
    setBusy(true)
    setTools([])
    setStreaming('')
    const ac = new AbortController()
    abortRef.current = ac
    // スレッドがなければこのメッセージで新しく作る
    let t = threadOverride ?? thread ?? null
    if (!t) {
      t = await createThread(content)
      setCurrent(t.id)
    }
    const prior = threadOverride ? [] : (messages ?? [])
    await db.chats.add({ thread: t.id, role: 'user', content, createdAt: Date.now() })
    await touchThread(t.id)
    const history = [...prior, { role: 'user' as const, content }].slice(-20).map((m) => ({ role: m.role, content: m.content }))
    const used: string[] = []
    const threadId = t.id
    try {
      const res = await runTask({
        task: 'chat',
        messages: history,
        about: t.about,
        cast,
        onToolCall: (n) => {
          used.push(n)
          setTools([...used])
        },
        onText: (d) => setStreaming((x) => x + d),
        signal: ac.signal,
      })
      await db.chats.add({ thread: threadId, role: 'assistant', content: res.text || '（応答が空でした）', createdAt: Date.now(), tools: used, model: res.model })
      await touchThread(threadId)
    } catch (e) {
      if (ac.signal.aborted) {
        // 停止した場合は、そこまでの応答を保存する
        setStreaming((partial) => {
          if (partial) void db.chats.add({ thread: threadId, role: 'assistant', content: partial + '\n（停止しました）', createdAt: Date.now(), tools: used })
          return ''
        })
        return
      }
      setError(e instanceof AiNotReadyError ? e.message : `エラー: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      setStreaming('')
      abortRef.current = null
    }
  }

  // 単語ページなど、チャットページ以外からの依頼は「新しいスレッド」で始める（古い会話の話題が混ざらないように）
  useEffect(() => {
    const key = `${search.about ?? ''}|${search.q ?? ''}`
    if ((!search.about && !search.q) || handledParams.current === key || !vault.unlocked) return
    handledParams.current = key
    void (async () => {
      const title = search.about ? `${headword(search.about)}について` : (search.q ?? '新しいチャット')
      const t = await createThread(title, search.about)
      setCurrent(t.id)
      void navigate({ to: '/ai', search: {}, replace: true })
      if (search.q) await send(search.q, t)
    })()
  }, [search.about, search.q, vault.unlocked])

  const SR = getSpeechRecognition()
  const listen = () => {
    if (!SR) return
    const rec = new SR()
    rec.lang = 'ja-JP'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.continuous = false
    setListening(true)
    rec.onresult = (e) => setInput((v) => v + (e.results[0] as ArrayLike<{ transcript: string }>)[0].transcript)
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.start()
  }

  if (!keys.length)
    return (
      <Card className="flex flex-col items-start gap-2">
        <p className="text-sm">AI チャットを使うには、設定で API キー（Gemini / ChatGPT / Claude / OpenRouter）を登録してください。</p>
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-accent">
          <Settings className="size-4" /> 設定を開く
        </Link>
      </Card>
    )
  if (!vault.unlocked)
    return (
      <Card>
        <p className="mb-2 text-sm">API キーのロックを解除してください。</p>
        <UnlockPanel compact />
      </Card>
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {personas.map((p) => {
          const on = cast.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setCast(on ? cast.filter((x) => x !== p.id) : [...cast, p.id].slice(-3))}
              className={'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ' + (on ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}
            >
              {p.emoji} {p.name}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-sm">
          {thread ? (
            <>
              <span className="font-medium">{thread.title}</span>
              {thread.about && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs">話題: <span className="font-en">{headword(thread.about)}</span></span>}
            </>
          ) : (
            <span className="text-muted">新しいチャット</span>
          )}
        </div>
        <button type="button" onClick={() => setShowHistory((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-fg">
          <History className="size-3.5" /> 履歴
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setCurrent(null)
            setShowHistory(false)
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-fg"
        >
          <MessageSquarePlus className="size-3.5" /> 新しいチャット
        </button>
      </div>
      {showHistory && (
        <HistoryPanel
          current={current}
          onPick={(id) => {
            setCurrent(id || null)
            setShowHistory(false)
          }}
          onClose={() => setShowHistory(false)}
        />
      )}
      <div className="flex min-h-48 flex-col gap-4">
        {messages?.length === 0 && !busy && (
          <div className="flex flex-col gap-2 py-6 text-center text-sm text-muted">
            <p>語源の質問、覚え方の相談、学習の作戦会議などをどうぞ。</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['spect を含む単語を語源から解説して', '今日の学習状況を見てアドバイスして', 'give up と abandon の違いは？'].map((x) => (
                <button key={x} type="button" onClick={() => void send(x)} className="rounded-full border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent">
                  {x}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages?.map((m) => <Bubble key={m.id} m={m} />)}
        {busy && streaming && <Bubble m={{ thread: current ?? '', role: 'assistant', content: streaming, createdAt: 0, tools }} live />}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="size-4 animate-spin" />
            {cast.map((id) => personaById(id)?.emoji).join('')} {streaming ? '入力中…' : '考え中…'}
            {!streaming &&
              tools.map((x, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded bg-surface-2 px-1">
                  <Wrench className="size-3" /> {x}
                </span>
              ))}
            <button type="button" onClick={() => abortRef.current?.abort()} className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 hover:text-danger">
              <Square className="size-3" /> 停止
            </button>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div ref={bottom} />
      </div>
      <form
        className="sticky bottom-16 flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 md:bottom-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send(input)
            }
          }}
          rows={1}
          placeholder="メッセージ（Shift+Enter で改行）"
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
        />
        {SR && (
          <button type="button" onClick={listen} aria-label="音声入力" className={'inline-flex size-10 items-center justify-center rounded-full ' + (listening ? 'animate-pulse text-accent' : 'text-muted hover:text-fg')}>
            <Mic className="size-5" />
          </button>
        )}
        <button type="submit" disabled={busy || !input.trim()} aria-label="送信" className="inline-flex size-10 items-center justify-center rounded-full bg-accent text-accent-fg disabled:opacity-40">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  )
}

export function AiPage() {
  const { t } = useTranslation()
  return (
    <Page title={t('ai.title')}>
      <Suspense fallback={<PageSpinner />}>
        <ChatView />
      </Suspense>
    </Page>
  )
}
