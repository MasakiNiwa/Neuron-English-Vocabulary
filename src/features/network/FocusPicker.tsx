import { useLiveQuery } from 'dexie-react-hooks'
import { Dices, LayoutGrid, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useMemo, useState } from 'react'
import { SearchField } from '@/components/ui/SearchField'
import { headword, type Dictionary } from '@/features/dictionary/data'
import { useDictionary } from '@/features/dictionary/hooks'
import { morphLabel } from '@/features/dictionary/components/links'
import type { MorphemeType, ToeicLevel } from '@/features/dictionary/types'
import { cn } from '@/lib/cn'
import { db } from '@/lib/db'
import { usePersistentState } from '@/lib/persist'

type Tab = 'root' | 'prefix' | 'suffix' | 'pie' | 'particle' | 'toeic' | 'history' | 'learning' | 'weak'

const TABS: { value: Tab; label: string }[] = [
  { value: 'root', label: '語根' },
  { value: 'prefix', label: '接頭辞' },
  { value: 'suffix', label: '接尾辞' },
  { value: 'pie', label: '祖語' },
  { value: 'particle', label: '不変化詞' },
  { value: 'toeic', label: 'TOEIC' },
  { value: 'history', label: '最近見た' },
  { value: 'learning', label: '学習中' },
  { value: 'weak', label: '苦手' },
]

const TOEIC_LEVELS: ToeicLevel[] = [470, 600, 730, 860, 990]

interface Item {
  id: string
  label: string
  sub: string
  note?: string
}

/** ランダムに 1 つ選ぶ（語根・接頭辞は単語が 5 つ以上あるもの、単語はよく使う 3000 語で語源の分かるもの） */
export function randomFocus(dict: Dictionary): string {
  if (Math.random() < 0.5) {
    const ms = dict.morphemes.filter((m) => (m.type === 'root' || m.type === 'prefix') && m.words.length >= 5)
    if (ms.length) return 'm:' + ms[Math.floor(Math.random() * ms.length)].id
  }
  const ws = dict.entries.filter((e) => e.type === 'w' && e.rank <= 3000 && e.morphs.length > 0)
  return 'e:' + ws[Math.floor(Math.random() * ws.length)].key
}

function entryItem(dict: Dictionary, key: string, note?: string): Item | null {
  const ie = dict.byKey.get(key)
  if (!ie || dict.hidden.has(key)) return null
  return { id: 'e:' + key, label: headword(key), sub: ie.gloss, note }
}

/**
 * つながりの中心を、分類・履歴・学習中の単語から選ぶ画面（検索の横の「選ぶ」ボタン）。
 * 最後に開いていた分類を覚えておく
 */
export function FocusPicker({ onPick }: { onPick: (focus: string) => void }) {
  const dict = useDictionary()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = usePersistentState<Tab>('network:pickerTab', 'root')
  const [level, setLevel] = usePersistentState<ToeicLevel>('network:pickerToeic', 600)
  const [q, setQ] = useState('')

  const views = useLiveQuery(() => (open && tab === 'history' ? db.views.orderBy('viewedAt').reverse().limit(300).toArray() : []), [open, tab])
  const cards = useLiveQuery(() => (open && (tab === 'learning' || tab === 'weak') ? db.cards.toArray() : []), [open, tab])

  const items = useMemo<Item[]>(() => {
    if (tab === 'root' || tab === 'prefix' || tab === 'suffix' || tab === 'pie' || tab === 'particle') {
      return dict.morphemes
        .filter((m) => m.type === (tab as MorphemeType) && m.words.length > 0)
        .sort((a, b) => b.words.length - a.words.length)
        .map((m) => ({ id: 'm:' + m.id, label: morphLabel(m), sub: m.meaning.ja, note: `${m.words.length}語` }))
    }
    if (tab === 'toeic') {
      return dict.entries
        .filter((e) => e.toeic === level)
        .sort((a, b) => a.rank - b.rank)
        .map((e) => ({ id: 'e:' + e.key, label: headword(e.key), sub: e.gloss }))
    }
    if (tab === 'history') {
      const seen = new Set<string>()
      const out: Item[] = []
      for (const v of views ?? []) {
        if (seen.has(v.entryId)) continue
        seen.add(v.entryId)
        const it = entryItem(dict, v.entryId)
        if (it) out.push(it)
        if (out.length >= 60) break
      }
      return out
    }
    const list = (cards ?? []).filter((c) => !c.suspended)
    if (tab === 'weak') {
      return list
        .filter((c) => c.state !== 0 && c.lapses > 0)
        .sort((a, b) => b.lapses - a.lapses || b.difficulty - a.difficulty)
        .slice(0, 60)
        .map((c) => entryItem(dict, c.entryId, `${c.lapses}回忘れた`))
        .filter((x): x is Item => !!x)
    }
    return list
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 100)
      .map((c) => entryItem(dict, c.entryId))
      .filter((x): x is Item => !!x)
  }, [tab, level, dict, views, cards])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? items.filter((x) => x.label.toLowerCase().includes(s) || x.sub.includes(s)) : items
    return list.slice(0, 300)
  }, [items, q])

  const pick = (id: string) => {
    onPick(id)
    setOpen(false)
    setQ('')
  }

  const empty =
    tab === 'history' ? 'まだ見た単語がありません' : tab === 'learning' ? '学習中の単語がありません' : tab === 'weak' ? '忘れたことのある単語はまだありません' : '見つかりません'

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 text-sm hover:border-accent"
          aria-label="分類・履歴から選ぶ"
        >
          <LayoutGrid className="size-4" />
          <span className="hidden sm:inline">選ぶ</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 top-12 z-50 flex flex-col rounded-t-2xl border border-border bg-bg md:inset-x-auto md:inset-y-10 md:left-1/2 md:w-[640px] md:-translate-x-1/2 md:rounded-2xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Dialog.Title className="flex-1 text-base font-semibold">つながりの中心を選ぶ</Dialog.Title>
            <button
              type="button"
              onClick={() => pick(randomFocus(dict))}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm text-accent-fg"
            >
              <Dices className="size-4" /> おまかせ
            </button>
            <Dialog.Close className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="閉じる">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">語根・接頭辞などの分類や、最近見た単語・学習中の単語から、つながりの中心を選びます</Dialog.Description>
          <div className="flex gap-1.5 overflow-x-auto px-4 py-2" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-sm',
                  tab === t.value ? 'border-accent bg-accent text-accent-fg' : 'border-border hover:border-accent',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'toeic' && (
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
              {TOEIC_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(l)}
                  className={cn('shrink-0 rounded-lg border px-2.5 py-0.5 text-xs', level === l ? 'border-accent text-accent' : 'border-border text-muted')}
                >
                  {l} 点
                </button>
              ))}
            </div>
          )}
          <div className="px-4 pb-2">
            <SearchField value={q} onValueChange={setQ} placeholder="この中から探す（英語・日本語）" className="[&_input]:h-9" />
          </div>
          <ul className="flex-1 overflow-y-auto px-2 pb-4">
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{empty}</li>}
            {filtered.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => pick(x.id)} className="flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-2">
                  <span className="font-en shrink-0 font-medium">{x.label}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{x.sub}</span>
                  {x.note && <span className="shrink-0 text-[11px] text-muted">{x.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
