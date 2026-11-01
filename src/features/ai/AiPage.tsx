import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Loader2,
  Menu,
  Mic,
  Pencil,
  RefreshCw,
  Settings,
  SquarePen,
  Square,
  Trash2,
  Users,
  Volume2,
  Wrench,
  X,
} from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { db, type ChatRecord, type ChatThread } from '@/lib/db'
import { getSpeechRecognition } from '@/lib/speech'
import { headword } from '@/features/dictionary/data'
import { useAiConfig } from './config'
import { Markdown } from './Markdown'
import { personaById, splitBySpeaker, usePersonas } from './personas'
import { createThread, deleteAllThreads, deleteMessagesFrom, deleteThread, MAX_THREADS, renameThread, touchThread, useChatUi } from './threads'
import type { AiSearch } from './search'
import { AiNotReadyError, runTask } from './service'
import { UnlockPanel } from './UnlockPanel'
import { useVault } from './useVault'

const FULL_HEIGHT = 'h-[calc(100dvh-3.5rem-3.5rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-3.5rem)]'

const SUGGESTIONS = [
  { title: '語源から解説', text: 'spect を含む単語を語源から解説して' },
  { title: '学習の作戦会議', text: '今日の学習状況を見てアドバイスして' },
  { title: '使い分け', text: 'give up と abandon の違いは？' },
  { title: '覚え方', text: '覚えにくい単語を語根でまとめて覚える方法を教えて' },
]

function speakJa(text: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/【[^】]+】/g, '').replace(/[*#`>|_-]/g, ''))
  u.lang = 'ja-JP'
  speechSynthesis.speak(u)
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
    >
      {children}
    </button>
  )
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <ActionButton
      label="コピー"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </ActionButton>
  )
}

function ToolChips({ tools }: { tools?: string[] }) {
  if (!tools?.length) return null
  return (
    <div className="mb-2 flex flex-wrap gap-1">
      {tools.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
          <Wrench className="size-3" /> {t}
        </span>
      ))}
    </div>
  )
}

function UserMessage({ m, onEdit, editable }: { m: ChatRecord; onEdit: (text: string) => void; editable: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.content)
  if (editing)
    return (
      <div className="ml-auto w-full max-w-[85%] rounded-3xl bg-surface-2 p-3">
        <AutoTextarea value={draft} onChange={setDraft} className="w-full text-sm" autoFocus onSubmit={() => (setEditing(false), onEdit(draft))} />
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="rounded-full px-3 py-1.5 text-xs text-muted hover:text-fg" onClick={() => (setEditing(false), setDraft(m.content))}>
            キャンセル
          </button>
          <button
            type="button"
            disabled={!draft.trim()}
            className="rounded-full bg-accent px-3 py-1.5 text-xs text-accent-fg disabled:opacity-40"
            onClick={() => {
              setEditing(false)
              onEdit(draft)
            }}
          >
            送信
          </button>
        </div>
      </div>
    )
  return (
    <div className="group flex flex-col items-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-surface-2 px-4 py-2.5 text-sm leading-relaxed">{m.content}</div>
      <div className="mt-0.5 flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <CopyButton text={m.content} />
        {editable && (
          <ActionButton label="編集して送り直す" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
          </ActionButton>
        )}
      </div>
    </div>
  )
}

function AssistantMessage({ m, live, onRegenerate }: { m: ChatRecord; live?: boolean; onRegenerate?: () => void }) {
  const parts = splitBySpeaker(m.content)
  return (
    <div className="group flex flex-col">
      <ToolChips tools={m.tools} />
      <div className="flex flex-col gap-4">
        {parts.map((p, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-base" title={p.persona?.name}>
              {p.persona?.emoji ?? '🤖'}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              {p.persona && <div className="mb-1 text-xs font-medium text-muted">{p.persona.name}</div>}
              <div className="text-[15px] leading-7">
                <Markdown text={p.text} />
                {live && i === parts.length - 1 && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent align-middle" />}
              </div>
            </div>
          </div>
        ))}
      </div>
      {!live && (
        <div className="mt-1 flex items-center gap-0.5 pl-11 text-[11px] text-muted">
          <CopyButton text={m.content} />
          <ActionButton label="読み上げ" onClick={() => speakJa(m.content)}>
            <Volume2 className="size-3.5" />
          </ActionButton>
          {onRegenerate && (
            <ActionButton label="再生成" onClick={onRegenerate}>
              <RefreshCw className="size-3.5" />
            </ActionButton>
          )}
          {m.model && <span className="ml-1 truncate opacity-0 transition-opacity group-hover:opacity-100">{m.model}</span>}
        </div>
      )}
    </div>
  )
}

/** 入力に合わせて高さが伸びるテキストエリア（Enter で送信・Shift+Enter で改行） */
function AutoTextarea({
  value,
  onChange,
  onSubmit,
  className,
  placeholder,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  className?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
          e.preventDefault()
          onSubmit()
        }
      }}
      rows={1}
      placeholder={placeholder}
      className={cn('resize-none bg-transparent outline-none placeholder:text-muted', className)}
    />
  )
}

function groupLabel(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000
  if (diff <= 0) return '今日'
  if (diff <= 1) return '昨日'
  if (diff <= 7) return '過去 7 日間'
  if (diff <= 30) return '過去 30 日間'
  return 'それ以前'
}

function ThreadItem({ t, active, onPick }: { t: ChatThread; active: boolean; onPick: (id: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(t.title)
  if (editing)
    return (
      <form
        className="px-1"
        onSubmit={(e) => {
          e.preventDefault()
          void renameThread(t.id, title)
          setEditing(false)
        }}
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            void renameThread(t.id, title)
            setEditing(false)
          }}
          className="w-full rounded-lg border border-accent bg-surface px-2 py-1.5 text-sm outline-none"
        />
      </form>
    )
  return (
    <div className={cn('group flex items-center rounded-lg pr-1 hover:bg-surface-2', active && 'bg-surface-2')}>
      <button type="button" className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm" onClick={() => onPick(t.id)} title={t.title}>
        {t.title}
      </button>
      <div className={cn('flex shrink-0 gap-0.5 md:opacity-0 md:group-hover:opacity-100', active && 'md:opacity-100')}>
        <ActionButton label="名前を変更" onClick={() => (setTitle(t.title), setEditing(true))}>
          <Pencil className="size-3.5" />
        </ActionButton>
        <ActionButton
          label="削除"
          onClick={async () => {
            if (!confirm(`「${t.title}」を削除しますか？`)) return
            await deleteThread(t.id)
            if (active) onPick(null)
          }}
        >
          <Trash2 className="size-3.5" />
        </ActionButton>
      </div>
    </div>
  )
}

/** チャット履歴（PC は左サイドバー、スマホは引き出し） */
function ThreadList({ current, onPick, onNew }: { current: string | null; onPick: (id: string | null) => void; onNew: () => void }) {
  const threads = useLiveQuery(() => db.threads.orderBy('updatedAt').reverse().toArray(), [])
  const groups: { label: string; items: ChatThread[] }[] = []
  for (const t of threads ?? []) {
    const label = groupLabel(t.updatedAt)
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] })
    groups.at(-1)!.items.push(t)
  }
  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <SquarePen className="size-4" /> 新しいチャット
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {threads?.length === 0 && <p className="px-2.5 py-2 text-xs text-muted">まだ履歴はありません。</p>}
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="px-2.5 py-1 text-[11px] font-medium text-muted">{g.label}</div>
            {g.items.map((t) => (
              <ThreadItem key={t.id} t={t} active={t.id === current} onPick={onPick} />
            ))}
          </div>
        ))}
      </div>
      {!!threads?.length && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted">
          <span>
            {threads.length} / {MAX_THREADS} 件を保存
          </span>
          <button
            type="button"
            className="hover:text-danger"
            onClick={async () => {
              if (!confirm('すべてのチャット履歴を削除しますか？')) return
              await deleteAllThreads()
              onPick(null)
            }}
          >
            すべて削除
          </button>
        </div>
      )}
    </div>
  )
}

/** 会話に参加するキャラクターの選択 */
function CastPicker({ onClose }: { onClose: () => void }) {
  const personas = usePersonas()
  const { cast, setCast } = useAiConfig()
  return (
    <div className="absolute right-2 top-12 z-30 w-72 rounded-2xl border border-border bg-surface p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">会話に参加するキャラ（最大 3 人）</span>
        <button type="button" onClick={onClose} aria-label="閉じる" className="text-muted hover:text-fg">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {personas.map((p) => {
          const on = cast.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setCast(on ? cast.filter((x) => x !== p.id) : [...cast, p.id].slice(-3))}
              className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2', on && 'bg-accent-soft text-accent hover:bg-accent-soft')}
            >
              <span className="text-lg">{p.emoji}</span>
              <span className="flex-1">{p.name}</span>
              {on && <Check className="size-4" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** チャットで使うモデルの切り替え（設定の「用途ごとのモデル割り当て」の AI チャットと同じ） */
function ModelSwitch() {
  const { keys, routes, setRoute } = useAiConfig()
  const options = keys.flatMap((k) => k.models.map((m) => ({ value: `${k.id}|${m}`, label: m, group: k.label })))
  if (options.length < 2) return null
  const r = routes.chat ?? (keys[0]?.models[0] ? { keyId: keys[0].id, model: keys[0].models[0] } : undefined)
  return (
    <select
      aria-label="モデル"
      value={r ? `${r.keyId}|${r.model}` : ''}
      onChange={(e) => {
        const [keyId, ...rest] = e.target.value.split('|')
        setRoute('chat', { keyId, model: rest.join('|') })
      }}
      className="max-w-40 truncate rounded-lg bg-transparent px-1.5 py-1 text-xs text-muted outline-none hover:bg-surface-2 hover:text-fg md:max-w-60"
    >
      {keys.map((k) => (
        <optgroup key={k.id} label={k.label}>
          {k.models.map((m) => (
            <option key={m} value={`${k.id}|${m}`}>
              {m}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function ChatView() {
  const search = useSearch({ from: '/ai' }) as AiSearch
  const navigate = useNavigate()
  const { cast } = useAiConfig()
  const vault = useVault()
  const current = useChatUi((s) => s.current)
  const setCurrent = useChatUi((s) => s.setCurrent)
  const thread = useLiveQuery(async () => (current ? ((await db.threads.get(current)) ?? null) : null), [current])
  const messages = useLiveQuery(async () => (current ? db.chats.where('thread').equals(current).sortBy('createdAt') : []), [current])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [tools, setTools] = useState<string[]>([])
  const [streaming, setStreaming] = useState('')
  const [drawer, setDrawer] = useState(false)
  const [castOpen, setCastOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const handledParams = useRef<string | null>(null)

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }
  // スレッドを開いたら一番下へ
  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom('instant'))
  }, [current, messages === undefined])
  // 新しいメッセージ・ストリーミング中は、一番下を見ているときだけ追従する
  useEffect(() => {
    if (atBottom) scrollToBottom(busy ? 'instant' : 'smooth')
  }, [messages?.length, streaming, busy])

  /** アシスタントの応答を生成して保存する */
  const generate = async (threadId: string, about: string | undefined, history: { role: 'user' | 'assistant'; content: string }[]) => {
    setError('')
    setBusy(true)
    setTools([])
    setStreaming('')
    setAtBottom(true)
    const ac = new AbortController()
    abortRef.current = ac
    const used: string[] = []
    try {
      const res = await runTask({
        task: 'chat',
        messages: history.slice(-20),
        about,
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
          if (partial) void db.chats.add({ thread: threadId, role: 'assistant', content: partial + '\n\n（停止しました）', createdAt: Date.now(), tools: used })
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

  /** メッセージを送信（threadOverride: 新しく作ったスレッドに送る場合 / prior: それまでの会話） */
  const send = async (text: string, threadOverride?: ChatThread, prior?: ChatRecord[]) => {
    const content = text.trim()
    if (!content || busy) return
    setInput('')
    let t = threadOverride ?? thread ?? null
    if (!t) {
      // 最初のメッセージを、そのままスレッドの名前にする
      t = await createThread(content.replace(/\s+/g, ' '))
      setCurrent(t.id)
    }
    const before = prior ?? (threadOverride ? [] : (messages ?? []))
    await db.chats.add({ thread: t.id, role: 'user', content, createdAt: Date.now() })
    await touchThread(t.id)
    await generate(t.id, t.about, [...before, { role: 'user' as const, content }].map((m) => ({ role: m.role, content: m.content })))
  }

  const regenerate = async () => {
    if (!thread || !messages?.length || busy) return
    const last = messages.at(-1)!
    if (last.role !== 'assistant') return
    await deleteMessagesFrom(thread.id, last.createdAt)
    const rest = messages.slice(0, -1)
    await generate(thread.id, thread.about, rest.map((m) => ({ role: m.role, content: m.content })))
  }

  const editAndResend = async (m: ChatRecord, text: string) => {
    if (!thread || !messages || busy || !text.trim()) return
    const idx = messages.findIndex((x) => x.id === m.id)
    await deleteMessagesFrom(thread.id, m.createdAt)
    await send(text, thread, messages.slice(0, idx))
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

  const pick = (id: string | null) => {
    if (busy) abortRef.current?.abort()
    setCurrent(id)
    setDrawer(false)
    setError('')
  }

  const empty = !busy && messages?.length === 0
  const lastUserIdx = messages ? messages.findLastIndex((m) => m.role === 'user') : -1
  const castPeople = cast.map((id) => personaById(id)).filter((p) => !!p)

  const composer = (
    <form
      className="flex flex-col rounded-3xl border border-border bg-surface px-3 pb-2 pt-3 shadow-sm focus-within:border-accent/60"
      onSubmit={(e) => {
        e.preventDefault()
        void send(input)
      }}
    >
      <AutoTextarea
        value={input}
        onChange={setInput}
        onSubmit={() => void send(input)}
        placeholder={thread?.about ? `${headword(thread.about)} について質問する` : 'メッセージを入力'}
        className="max-h-[200px] min-h-6 px-1 text-[15px]"
      />
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setCastOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
          title="キャラクター"
        >
          {castPeople.length ? castPeople.map((p) => p.emoji).join('') : <Users className="size-4" />}
          <span className="hidden sm:inline">{castPeople.map((p) => p.name).join('・')}</span>
        </button>
        <div className="flex-1" />
        {SR && (
          <button
            type="button"
            onClick={listen}
            aria-label="音声入力"
            className={cn('inline-flex size-9 items-center justify-center rounded-full', listening ? 'animate-pulse text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}
          >
            <Mic className="size-5" />
          </button>
        )}
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()} aria-label="停止" className="inline-flex size-9 items-center justify-center rounded-full bg-fg text-bg">
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} aria-label="送信" className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-accent-fg disabled:opacity-30">
            <ArrowUp className="size-5" />
          </button>
        )}
      </div>
    </form>
  )

  return (
    <div className={cn('relative flex', FULL_HEIGHT)}>
      {/* PC: 左のチャット履歴 */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface/40 md:block">
        <ThreadList current={current} onPick={pick} onNew={() => pick(null)} />
      </aside>
      {/* スマホ: 引き出し */}
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 md:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[82%] max-w-80 border-r border-border bg-bg pt-[env(safe-area-inset-top)] md:hidden">
            <div className="flex items-center justify-between px-4 pt-3">
              <Dialog.Title className="text-sm font-semibold">チャット履歴</Dialog.Title>
              <Dialog.Close className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2" aria-label="閉じる">
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">過去のチャットを開く・名前を変更する・削除する</Dialog.Description>
            <div className="h-[calc(100%-3rem)]">
              <ThreadList current={current} onPick={pick} onNew={() => pick(null)} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <section className="relative flex min-w-0 flex-1 flex-col">
        {/* 上部バー */}
        <div className="flex h-12 shrink-0 items-center gap-1 px-2">
          <button type="button" onClick={() => setDrawer(true)} aria-label="チャット履歴" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 md:hidden">
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1 truncate px-1 text-sm">
            {thread ? (
              <>
                <span className="font-medium">{thread.title}</span>
                {thread.about && (
                  <Link to="/e/$key" params={{ key: thread.about }} className="font-en ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs hover:text-accent">
                    {headword(thread.about)}
                  </Link>
                )}
              </>
            ) : (
              <span className="text-muted">新しいチャット</span>
            )}
          </div>
          <ModelSwitch />
          <button type="button" onClick={() => pick(null)} aria-label="新しいチャット" title="新しいチャット" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg md:hidden">
            <SquarePen className="size-5" />
          </button>
        </div>
        {castOpen && <CastPicker onClose={() => setCastOpen(false)} />}

        {empty ? (
          /* 最初の画面: 中央にあいさつ・入力欄・おすすめ */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-6">
            <div className="w-full max-w-2xl">
              <div className="mb-2 text-center text-4xl">{castPeople.map((p) => p.emoji).join(' ') || '🤖'}</div>
              <h2 className="mb-6 text-center text-xl font-semibold md:text-2xl">
                {thread?.about ? `${headword(thread.about)} について話しましょう` : '何について話しましょう？'}
              </h2>
              {composer}
              {!thread?.about && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.text}
                      type="button"
                      onClick={() => void send(s.text)}
                      className="rounded-2xl border border-border p-3 text-left hover:bg-surface-2"
                    >
                      <div className="text-sm font-medium">{s.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted">{s.text}</div>
                    </button>
                  ))}
                </div>
              )}
              {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scroller}
              onScroll={(e) => {
                const el = e.currentTarget
                setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
              }}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-6 pt-2">
                {messages?.map((m, i) =>
                  m.role === 'user' ? (
                    <UserMessage key={m.id} m={m} editable={!busy && i === lastUserIdx} onEdit={(text) => void editAndResend(m, text)} />
                  ) : (
                    <AssistantMessage key={m.id} m={m} onRegenerate={!busy && i === messages.length - 1 ? () => void regenerate() : undefined} />
                  ),
                )}
                {busy && streaming && <AssistantMessage m={{ thread: current ?? '', role: 'assistant', content: streaming, createdAt: 0, tools }} live />}
                {busy && !streaming && (
                  <div className="flex items-center gap-3 text-sm text-muted">
                    <span className="flex size-8 items-center justify-center rounded-full border border-border bg-surface">
                      <Loader2 className="size-4 animate-spin" />
                    </span>
                    考え中…
                    {tools.map((x, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 text-[11px]">
                        <Wrench className="size-3" /> {x}
                      </span>
                    ))}
                  </div>
                )}
                {error && <p className="text-sm text-danger">{error}</p>}
              </div>
            </div>
            {!atBottom && (
              <button
                type="button"
                onClick={() => scrollToBottom()}
                aria-label="一番下へ"
                className="absolute bottom-32 left-1/2 inline-flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface shadow-lg hover:bg-surface-2"
              >
                <ArrowDown className="size-4" />
              </button>
            )}
            <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-3">
              {composer}
              <p className="mt-1.5 text-center text-[10px] text-muted">AI の回答は間違うことがあります。辞書のデータもあわせて確認してください。</p>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Gate({ children }: { children: React.ReactNode }) {
  const { keys } = useAiConfig()
  const vault = useVault()
  if (!keys.length)
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <Card className="flex flex-col items-start gap-2">
          <p className="text-sm">AI チャットを使うには、設定の「AI 連携（API）」で API キー（Gemini / ChatGPT / Claude / OpenRouter）を登録してください。</p>
          <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-accent">
            <Settings className="size-4" /> 設定を開く
          </Link>
        </Card>
      </div>
    )
  if (!vault.unlocked)
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <Card>
          <p className="mb-2 text-sm">API キーのロックを解除してください。</p>
          <UnlockPanel compact />
        </Card>
      </div>
    )
  return <>{children}</>
}

export function AiPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Gate>
        <ChatView />
      </Gate>
    </Suspense>
  )
}
