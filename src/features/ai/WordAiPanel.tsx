import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Loader2, Plus, Sparkles, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { db, type ExtraNote } from '@/lib/db'
import { LinkedText } from '@/features/dictionary/components/links'
import { headword } from '@/features/dictionary/data'
import { resolveRoute, useAiConfig } from './config'
import { addExtra, extractJson, extraPrompt, moveExtra, removeExtra, sanitizeExtra } from './extras'
import { ModelSelect } from './ModelSelect'
import { markInternalAsk } from './internalAsk'
import { INCOMPLETE_LABEL } from './providers'
import { AiNotReadyError, runTask } from './service'
import { UnlockPanel } from './UnlockPanel'

const QUICK = [
  { label: '語源を物語で', q: 'この単語の語源を、成り立ちから意味が生まれるまでの物語として教えて' },
  { label: '覚え方を提案', q: 'この単語の覚え方を、語根や似た単語とのつながりを使って提案して' },
  { label: '使い分け', q: 'この単語と似た意味の単語との使い分けを教えて' },
  { label: '例文をもっと', q: 'この単語を使った自然な例文を、場面別に3つ作って' },
]

const TOOL_LABEL: Record<string, string> = { get_word: '辞書を確認中', get_root: '語根を確認中', search_words: '単語を検索中' }

/** 文字列だけを表示する（保存データの形が壊れていても描画を壊さない） */
function Text({ v }: { v: unknown }) {
  return typeof v === 'string' && v ? <LinkedText text={v} /> : null
}

function ExtraBody({ x }: { x: ExtraNote }) {
  const examples = Array.isArray(x.examples) ? x.examples.filter((e) => e && typeof e.en === 'string') : []
  const rows: [string, unknown][] = [
    ['覚え方', x.mnemonic],
    ['由来', x.story],
    ['使い方', x.note],
  ]
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      {rows.map(([label, v]) =>
        typeof v === 'string' && v ? (
          <div key={label}>
            <div className="mb-0.5 text-xs font-medium text-accent">{label}</div>
            <p className="whitespace-pre-line">
              <Text v={v} />
            </p>
          </div>
        ) : null,
      )}
      {examples.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-accent">例文</div>
          {examples.map((ex, i) => (
            <div key={i} className="rounded-xl bg-surface-2 p-2">
              <p className="font-en">
                <Text v={ex.en} />
              </p>
              {typeof ex.ja === 'string' && <p className="text-muted">{ex.ja}</p>}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted">
        {x.source === 'api' ? `AI（${x.model ?? x.title}）で作成` : '外部 AI で作成し取り込んだ内容'}・{new Date(x.createdAt).toLocaleDateString('ja-JP')}。AI の出力のため誤りを含むことがあります
      </p>
    </div>
  )
}

/** 追加の解説（AI ごとに複数。タブで切り替え・並べ替え・削除） */
function Extras({ entryKey, list, active, setActive }: { entryKey: string; list: ExtraNote[]; active?: string; setActive: (id: string) => void }) {
  const cur = list.find((x) => x.id === active) ?? list[0]
  const idx = list.indexOf(cur)
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted">追加の解説</h2>
      <div className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center gap-1 border-b border-border px-2 pt-2">
          <div role="tablist" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {list.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={x.id === cur.id}
                onClick={() => setActive(x.id)}
                className={cn(
                  '-mb-px max-w-48 shrink-0 truncate rounded-t-lg border border-b-0 px-3 py-1.5 text-xs',
                  x.id === cur.id ? 'border-border bg-surface font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
                )}
                title={x.model ?? x.title}
              >
                {x.title}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center pb-1 text-muted">
            <button type="button" aria-label="左へ移動" title="左へ移動" disabled={idx <= 0} onClick={() => void moveExtra(entryKey, cur.id, -1)} className="rounded-md p-1 hover:bg-surface-2 hover:text-fg disabled:opacity-30">
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="右へ移動"
              title="右へ移動"
              disabled={idx >= list.length - 1}
              onClick={() => void moveExtra(entryKey, cur.id, 1)}
              className="rounded-md p-1 hover:bg-surface-2 hover:text-fg disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              aria-label="この解説を削除"
              title="この解説を削除"
              onClick={() => {
                if (confirm(`「${cur.title}」の解説を削除しますか？`)) void removeExtra(cur.id)
              }}
              className="rounded-md p-1 hover:bg-surface-2 hover:text-danger"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
        <div role="tabpanel" className="p-3">
          <ExtraBody x={cur} />
        </div>
      </div>
    </section>
  )
}

/** 単語ページの「AI に聞く」と、追加の解説 */
export function WordAiPanel({ entryKey }: { entryKey: string }) {
  const list = useLiveQuery(() => db.extras.where('[entryId+order]').between([entryKey, -Infinity], [entryKey, Infinity]).toArray(), [entryKey])
  const hasKeys = useAiConfig((s) => s.keys.some((k) => k.models.length > 0))
  const [active, setActive] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [needUnlock, setNeedUnlock] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 別の単語へ移ったら、作成中のものは止める
  useEffect(() => {
    setActive(undefined)
    setError('')
    setNeedUnlock(false)
    return () => abortRef.current?.abort()
  }, [entryKey])

  const generate = async () => {
    if (abortRef.current) return // 連打で 2 つ作らない（B14）
    setError('')
    setNeedUnlock(false)
    setBusy(true)
    setStatus('作成中')
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const res = await runTask({
        messages: [{ role: 'user', content: extraPrompt(headword(entryKey)) }],
        about: entryKey,
        onToolCall: (n) => setStatus(TOOL_LABEL[n] ?? '作成中'),
        onText: () => setStatus('書いています'),
        signal: ac.signal,
      })
      if (res.incomplete) throw new Error(`${INCOMPLETE_LABEL[res.incomplete]}。もう一度お試しください`)
      const fields = sanitizeExtra(extractJson(res.text))
      if (!fields) throw new Error('解説の形式を読み取れませんでした。もう一度お試しください')
      const model = resolveRoute()?.model
      const rec = await addExtra(entryKey, fields, { title: model ?? 'AI', source: 'api', model: res.model })
      setActive(rec.id)
    } catch (e) {
      if (ac.signal.aborted) return
      if (e instanceof AiNotReadyError && e.reason === 'locked') setNeedUnlock(true)
      else setError(e instanceof SyntaxError ? '解説の形式を読み取れませんでした。もう一度お試しください' : e instanceof Error ? e.message : String(e))
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setBusy(false)
      setStatus('')
    }
  }

  return (
    <>
      {list && list.length > 0 && <Extras entryKey={entryKey} list={list} active={active} setActive={setActive} />}
      <section className="mt-5">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tracking-wide text-muted">
            <Sparkles className="size-4" /> AI に聞く
          </h2>
          {hasKeys && <ModelSelect className="ml-auto max-w-[60%]" />}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((x) => (
            <Link
              key={x.label}
              to="/ai"
              search={{ about: entryKey, q: x.q }}
              onClick={() => markInternalAsk(entryKey, x.q)}
              className="rounded-full border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent"
            >
              {x.label}
            </Link>
          ))}
          <Link to="/ai" search={{ about: entryKey }} onClick={() => markInternalAsk(entryKey, undefined)} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent">
            自由に質問…
          </Link>
          {hasKeys &&
            (busy ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="inline-flex items-center gap-1 rounded-full border border-accent px-3 py-1 text-xs text-accent"
                title="作成を中止"
              >
                <Loader2 className="size-3.5 animate-spin" /> {status}… <Square className="ml-1 size-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void generate()}
                className="inline-flex items-center gap-1 rounded-full border border-accent/60 bg-accent/10 px-3 py-1 text-xs text-accent hover:bg-accent/20"
                title="選んだモデルで、この単語の詳しい解説を作ってこのページに追加します"
              >
                <Plus className="size-3.5" /> 追加の解説を作成
              </button>
            ))}
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        {needUnlock && (
          <div className="mt-3 rounded-2xl border border-border p-3">
            <UnlockPanel compact />
          </div>
        )}
      </section>
    </>
  )
}
