import { Check, ChevronDown, Loader2, Plus, RefreshCw, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { selectClass } from '@/components/ui/Form'
import { SearchField } from '@/components/ui/SearchField'
import { cn } from '@/lib/cn'
import { fetchCatalog, formatPrice, formatTokens, getCachedCatalog, setCachedCatalog, suggestedInfo, type ModelInfo } from './catalog'
import { PROVIDERS, useAiConfig, type ApiKeyEntry } from './config'
import { inputClass } from './UnlockPanel'
import { getSecret } from './vault'

type Sort = 'recommended' | 'newest' | 'name' | 'cheapest' | 'context'

function sortModels(list: ModelInfo[], sort: Sort, suggested: string[]) {
  const arr = [...list]
  switch (sort) {
    case 'newest':
      return arr.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    case 'name':
      return arr.sort((a, b) => a.id.localeCompare(b.id))
    case 'cheapest':
      return arr.sort((a, b) => (a.inputPrice ?? Infinity) - (b.inputPrice ?? Infinity))
    case 'context':
      return arr.sort((a, b) => (b.context ?? 0) - (a.context ?? 0))
    default: {
      // おすすめ: 推奨モデル → 新しい順
      const rank = (m: ModelInfo) => {
        const i = suggested.indexOf(m.id)
        return i < 0 ? 100 : i
      }
      return arr.sort((a, b) => rank(a) - rank(b) || (b.created ?? 0) - (a.created ?? 0))
    }
  }
}

function Meta({ m }: { m: ModelInfo }) {
  const items = [
    formatTokens(m.context) && `入力 ${formatTokens(m.context)}`,
    formatTokens(m.maxOutput) && `出力 ${formatTokens(m.maxOutput)}`,
    m.inputPrice !== undefined &&
      `${formatPrice(m.inputPrice)} / ${formatPrice(m.outputPrice)}${m.priceIsReference ? '（参考）' : ''}`,
    m.created && new Date(m.created).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' }),
  ].filter(Boolean)
  if (!items.length) return null
  return <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-[11px] text-muted">{items.map((x, i) => <span key={i}>{x}</span>)}</div>
}

function Row({ m, selected, onToggle }: { m: ModelInfo; selected: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn('flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3', selected && 'bg-accent-soft/50')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        onClick={onToggle}
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border',
          selected ? 'border-accent bg-accent text-accent-fg' : 'border-border',
        )}
      >
        {selected && <Check className="size-3.5" />}
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggle}>
        <div className="truncate font-mono text-sm">{m.id}</div>
        {m.name && m.name !== m.id && <div className="truncate text-xs">{m.name}</div>}
        <Meta m={m} />
      </button>
      {m.description && (
        <button type="button" aria-label="説明" onClick={() => setOpen(!open)} className="shrink-0 text-muted hover:text-fg">
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </button>
      )}
      {open && m.description && (
        <p className="w-full pl-8 text-xs leading-relaxed text-muted">{m.description}</p>
      )}
    </div>
  )
}

/** API キーごとのモデル選択画面（スマホは全画面） */
export function ModelPicker({ apiKey, open, onOpenChange }: { apiKey: ApiKeyEntry; open: boolean; onOpenChange: (v: boolean) => void }) {
  const update = useAiConfig((s) => s.updateKey)
  const suggested = PROVIDERS[apiKey.provider].suggested
  const [catalog, setCatalog] = useState<{ fetchedAt: number; models: ModelInfo[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const [chatOnly, setChatOnly] = useState(true)
  const [sort, setSort] = useState<Sort>('recommended')
  const [custom, setCustom] = useState('')

  const refresh = async () => {
    setErr('')
    setLoading(true)
    try {
      const models = await fetchCatalog(apiKey.provider, (await getSecret(apiKey.id)) ?? '')
      await setCachedCatalog(apiKey.id, models)
      setCatalog({ fetchedAt: Date.now(), models })
    } catch (e) {
      setErr(`一覧を取得できませんでした: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void getCachedCatalog(apiKey.id).then((c) => {
      if (c) setCatalog(c)
      else void refresh()
    })
  }, [open, apiKey.id])

  const all = useMemo((): ModelInfo[] => {
    const base = catalog?.models ?? suggestedInfo(suggested)
    // 選択済みだが一覧にないモデル（手入力など）も表示
    const extra = apiKey.models.filter((id) => !base.some((m) => m.id === id)).map((id): ModelInfo => ({ id }))
    return [...base, ...extra]
  }, [catalog, suggested, apiKey.models])

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const filtered = all.filter(
      (m) =>
        (!onlySelected || apiKey.models.includes(m.id)) &&
        (!chatOnly || !m.nonChat || apiKey.models.includes(m.id)) &&
        (!qq || m.id.toLowerCase().includes(qq) || m.name?.toLowerCase().includes(qq) || m.description?.toLowerCase().includes(qq)),
    )
    return sortModels(filtered, sort, suggested)
  }, [all, q, onlySelected, chatOnly, sort, suggested, apiKey.models])

  const toggle = (id: string) =>
    update(apiKey.id, { models: apiKey.models.includes(id) ? apiKey.models.filter((x) => x !== id) : [...apiKey.models, id] })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-bg md:inset-x-auto md:inset-y-8 md:left-1/2 md:w-[640px] md:-translate-x-1/2 md:rounded-2xl md:border md:border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-semibold">モデルを選択</Dialog.Title>
              <Dialog.Description className="truncate text-xs text-muted">
                {PROVIDERS[apiKey.provider].name} / {apiKey.label}
              </Dialog.Description>
            </div>
            <Dialog.Close className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-2" aria-label="閉じる">
              <X className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
            <SearchField value={q} onValueChange={setQ} placeholder="モデル名・説明で検索" className="[&_input]:h-10" />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setOnlySelected(!onlySelected)}
                className={cn('rounded-full border px-2.5 py-1', onlySelected ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}
              >
                選択中のみ（{apiKey.models.length}）
              </button>
              <button
                type="button"
                onClick={() => setChatOnly(!chatOnly)}
                className={cn('rounded-full border px-2.5 py-1', chatOnly ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}
              >
                チャット向けのみ
              </button>
              <select className={selectClass + ' h-8 text-xs'} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="並び替え">
                <option value="recommended">おすすめ順</option>
                <option value="newest">新しい順</option>
                <option value="cheapest">安い順（入力）</option>
                <option value="context">コンテキストが長い順</option>
                <option value="name">名前順</option>
              </select>
              <div className="flex-1" />
              <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-1 text-muted hover:text-fg">
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                {catalog ? `更新（${new Date(catalog.fetchedAt).toLocaleDateString('ja-JP')}）` : '一覧を取得'}
              </button>
            </div>
            {err && <p className="text-xs text-danger">{err}</p>}
            <p className="text-[11px] text-muted">価格は 100 万トークンあたりの 入力 / 出力（USD）。取得できない場合は表示されません。</p>
          </div>

          <div className="flex-1 divide-y divide-border overflow-y-auto">
            {list.map((m) => (
              <Row key={m.id} m={m} selected={apiKey.models.includes(m.id)} onToggle={() => toggle(m.id)} />
            ))}
            {!list.length && <p className="p-6 text-center text-sm text-muted">該当するモデルがありません</p>}
          </div>

          <div className="pb-safe flex flex-col gap-2 border-t border-border px-4 py-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const id = custom.trim()
                if (id && !apiKey.models.includes(id)) update(apiKey.id, { models: [...apiKey.models, id] })
                setCustom('')
              }}
            >
              <input className={inputClass} placeholder="一覧にないモデル ID を直接追加" value={custom} onChange={(e) => setCustom(e.target.value)} />
              <Button type="submit" size="sm" className="h-10" disabled={!custom.trim()} aria-label="追加">
                <Plus className="size-4" />
              </Button>
            </form>
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              完了（{apiKey.models.length} 件選択中）
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
