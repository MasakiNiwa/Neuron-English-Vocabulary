import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Loader2, Mic, Send, Settings, Trash2, Volume2, Wrench, X } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionSection } from '@/components/ui/Accordion'
import { Card } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { db, type ChatRecord } from '@/lib/db'
import { getSpeechRecognition } from '@/lib/speech'
import { headword } from '@/features/dictionary/data'
import { LinkedText } from '@/features/dictionary/components/links'
import { useAiConfig } from './config'
import { ExternalAi } from './ExternalAi'
import { PERSONAS, personaById, splitBySpeaker } from './personas'
import type { AiSearch } from './search'
import { AiNotReadyError, runTask } from './service'
import { UnlockPanel } from './UnlockPanel'
import { useVault } from './useVault'

const THREAD = 'main'

function speakJa(text: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/【[^】]+】/g, ''))
  u.lang = 'ja-JP'
  speechSynthesis.speak(u)
}

/** 日本語の文中にある英単語をリンク化（LinkedText は英字部分だけを判定する） */
function Bubble({ m }: { m: ChatRecord }) {
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
      <div className="flex items-center gap-2 pl-10 text-[10px] text-muted">
        <button type="button" onClick={() => speakJa(m.content)} className="hover:text-accent" aria-label="読み上げ">
          <Volume2 className="size-3.5" />
        </button>
        {m.model}
      </div>
    </div>
  )
}

function ChatView() {
  const search = useSearch({ from: '/ai' }) as AiSearch
  const navigate = useNavigate()
  const { keys, cast, setCast } = useAiConfig()
  const vault = useVault()
  const messages = useLiveQuery(() => db.chats.where('thread').equals(THREAD).sortBy('createdAt'), [])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [tools, setTools] = useState<string[]>([])
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const about = search.about
  const bottom = useRef<HTMLDivElement>(null)
  const sentQ = useRef<string | null>(null)

  useEffect(() => {
    void bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages?.length, busy])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || busy) return
    setError('')
    setInput('')
    setBusy(true)
    setTools([])
    const now = Date.now()
    await db.chats.add({ thread: THREAD, role: 'user', content, createdAt: now })
    const history = [...(messages ?? []), { role: 'user' as const, content }].slice(-20).map((m) => ({ role: m.role, content: m.content }))
    const used: string[] = []
    try {
      const res = await runTask({
        task: 'chat',
        messages: history,
        about,
        cast,
        onToolCall: (n) => {
          used.push(n)
          setTools([...used])
        },
      })
      await db.chats.add({ thread: THREAD, role: 'assistant', content: res.text || '（応答が空でした）', createdAt: Date.now(), tools: used, model: res.model })
    } catch (e) {
      setError(e instanceof AiNotReadyError ? e.message : `エラー: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // 単語ページなどから質問付きで開かれたら自動送信
  useEffect(() => {
    if (search.q && messages && vault.unlocked && sentQ.current !== search.q) {
      sentQ.current = search.q
      void send(search.q)
      void navigate({ to: '/ai', search: { about }, replace: true })
    }
  }, [search.q, messages, vault.unlocked])

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
        <p className="text-sm">AI チャットを使うには、設定で API キー（Gemini / OpenAI / Claude / OpenRouter）を登録してください。</p>
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-accent">
          <Settings className="size-4" /> 設定を開く
        </Link>
        <p className="text-xs text-muted">API キーがなくても、下の「外部 AI 連携」で解説データを作成・取り込みできます。</p>
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
        {PERSONAS.map((p) => {
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
        <div className="flex-1" />
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger"
          onClick={() => {
            if (confirm('会話をクリアしますか？')) void db.chats.where('thread').equals(THREAD).delete()
          }}
        >
          <Trash2 className="size-3.5" /> クリア
        </button>
      </div>
      {about && (
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs">
          話題: <span className="font-en font-medium">{headword(about)}</span>
          <button type="button" aria-label="話題を外す" onClick={() => void navigate({ to: '/ai', search: {} })}>
            <X className="size-3" />
          </button>
        </div>
      )}
      <div className="flex min-h-48 flex-col gap-4">
        {messages?.length === 0 && (
          <div className="flex flex-col gap-2 py-6 text-center text-sm text-muted">
            <p>語源の質問、覚え方の相談、学習の作戦会議などをどうぞ。</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['spect を含む単語を語源から解説して', '今日の学習状況を見てアドバイスして', 'give up と abandon の違いは？'].map((s) => (
                <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages?.map((m) => <Bubble key={m.id} m={m} />)}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="size-4 animate-spin" />
            {cast.map((id) => personaById(id)?.emoji).join('')} 考え中…
            {tools.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded bg-surface-2 px-1">
                <Wrench className="size-3" /> {t}
              </span>
            ))}
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
  const search = useSearch({ from: '/ai' }) as AiSearch
  return (
    <Page title={t('ai.title')}>
      <Suspense fallback={<PageSpinner />}>
        <ChatView />
      </Suspense>
      <div className="mt-6">
        <Accordion>
          <AccordionSection value="external" title="外部 AI 連携（プロンプト作成・データ取り込み）">
            <ExternalAi defaultWords={search.about ? headword(search.about) : ''} />
          </AccordionSection>
        </Accordion>
      </div>
    </Page>
  )
}
