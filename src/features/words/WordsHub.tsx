import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, BookOpenCheck, Briefcase, Clock, Layers, ListOrdered, Shapes, Shuffle, Sparkles, TextQuote } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { usePersistentState } from '@/lib/persist'
import { EntryRow } from '@/features/dictionary/components/EntryRow'
import { morphLabel } from '@/features/dictionary/components/links'
import { useDictionary } from '@/features/dictionary/hooks'
import { useNextRoot } from '@/features/lesson/RootsPage'
import { addManyToStudy } from '@/features/study/cards'
import { db } from '@/lib/db'
import { categoryById, LEVEL_CATEGORIES, PHRASE_CATEGORIES, POS_CATEGORIES, TOEIC_CATEGORIES, type Category } from './categories'

function Section({ icon, title, note, children }: { icon: React.ReactNode; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
        {icon} {title}
      </h2>
      {children}
      {note && <p className="mt-1.5 text-[11px] text-muted">{note}</p>}
    </section>
  )
}

function Tile({ c, count }: { c: Category; count: number }) {
  return (
    <Link
      to="/words"
      search={{ c: c.id }}
      className="flex flex-col rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-accent"
    >
      <span className="text-sm font-medium">{c.title}</span>
      {c.hint && <span className="text-[11px] text-muted">{c.hint}</span>}
      <span className="mt-1 text-xs tabular-nums text-accent">{count.toLocaleString('ja-JP')} 語</span>
    </Link>
  )
}

/**
 * 単語ページの入口。検索していないときに、レベル・TOEIC・語源・品詞・熟語などから学びを始められるようにする
 */
export function WordsHub() {
  const dict = useDictionary()
  const navigate = useNavigate()
  const next = useNextRoot()
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of [...LEVEL_CATEGORIES, ...TOEIC_CATEGORIES, ...POS_CATEGORIES, ...PHRASE_CATEGORIES]) m.set(c.id, dict.entries.filter(c.match).length)
    return m
  }, [dict])
  const prefixes = dict.morphemes.filter((m) => m.type === 'prefix').length
  const random = () => {
    const words = dict.entries.filter((e) => e.type === 'w' && e.hasNote)
    const e = words[Math.floor(Math.random() * words.length)]
    void navigate({ to: '/e/$key', params: { key: e.key } })
  }
  const grid = 'grid grid-cols-2 gap-2 sm:grid-cols-3'
  return (
    <div className="flex flex-col gap-6">
      <Section icon={<Layers className="size-4" />} title="レベルから">
        <div className={grid}>
          {LEVEL_CATEGORIES.map((c) => (
            <Tile key={c.id} c={c} count={counts.get(c.id) ?? 0} />
          ))}
        </div>
      </Section>

      <Section
        icon={<Briefcase className="size-4" />}
        title="TOEIC のレベルから"
        note="レベルは公式の基準ではなく、一般の英語での頻度と、TOEIC で特に多い語（TOEIC Service List）から推定した目安です。"
      >
        <div className={grid}>
          {TOEIC_CATEGORIES.map((c) => (
            <Tile key={c.id} c={c} count={counts.get(c.id) ?? 0} />
          ))}
        </div>
      </Section>

      <Section icon={<Sparkles className="size-4" />} title="語源から">
        <div className={grid}>
          {next?.next && (
            <Link
              to="/lesson/$id"
              params={{ id: next.next.id }}
              className="flex flex-col rounded-2xl border border-accent/40 bg-accent-soft p-3 hover:border-accent"
            >
              <span className="text-sm font-medium">次の語根レッスン</span>
              <span className="text-[11px] text-muted">
                <span className="font-en">{morphLabel(next.next)}</span>（{next.next.meaning.ja}）
              </span>
              <span className="mt-1 text-xs text-accent">はじめる →</span>
            </Link>
          )}
          <Link to="/roots" className="flex flex-col rounded-2xl border border-border bg-surface p-3 hover:border-accent">
            <span className="inline-flex items-center gap-1 text-sm font-medium">
              <BookOpenCheck className="size-4" /> 語根図鑑
            </span>
            <span className="text-[11px] text-muted">レッスンで集めた語根</span>
            {next && <span className="mt-1 text-xs tabular-nums text-accent">{next.done} / {next.total}</span>}
          </Link>
          <Link to="/words" search={{ f: 'm' }} className="flex flex-col rounded-2xl border border-border bg-surface p-3 hover:border-accent">
            <span className="text-sm font-medium">語根・接頭辞の一覧</span>
            <span className="text-[11px] text-muted">語根から単語をたどる</span>
            <span className="mt-1 text-xs tabular-nums text-accent">接頭辞 {prefixes}</span>
          </Link>
        </div>
      </Section>

      <Section icon={<Shapes className="size-4" />} title="品詞から">
        <div className="flex flex-wrap gap-1.5">
          {POS_CATEGORIES.map((c) => (
            <Link
              key={c.id}
              to="/words"
              search={{ c: c.id }}
              className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
            >
              {c.title} <span className="text-xs tabular-nums text-muted">{(counts.get(c.id) ?? 0).toLocaleString('ja-JP')}</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section icon={<TextQuote className="size-4" />} title="熟語">
        <div className={grid}>
          {PHRASE_CATEGORIES.map((c) => (
            <Tile key={c.id} c={c} count={counts.get(c.id) ?? 0} />
          ))}
        </div>
      </Section>

      <Section icon={<ListOrdered className="size-4" />} title="ほかの入口">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={random}>
            <Shuffle className="size-4" /> ランダムな単語
          </Button>
          <Link to="/history" className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-3 text-sm hover:bg-surface-2">
            <Clock className="size-4" /> 最近見た単語
          </Link>
          <Link to="/words" search={{ f: 'w' }} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-3 text-sm hover:bg-surface-2">
            <ListOrdered className="size-4" /> すべての単語（頻度順）
          </Link>
        </div>
      </Section>
    </div>
  )
}

/** 分類ごとの単語一覧。先頭からまとめて学習カードに追加できる */
export function CategoryList({ id }: { id: string }) {
  const dict = useDictionary()
  const c = categoryById(id)!
  const list = useMemo(() => dict.entries.filter(c.match), [dict, c])
  const [limit, setLimit] = usePersistentState('words:cat:' + id, 100)
  const [added, setAdded] = useState<number | null>(null)
  const addTop = async () => {
    // まだ学習カードにない語を先頭から 20 語
    const have = new Set(await db.cards.toCollection().primaryKeys())
    const keys = list.filter((e) => !have.has(e.key)).slice(0, 20).map((e) => e.key)
    setAdded(await addManyToStudy(keys))
  }
  return (
    <div className="flex flex-col gap-3">
      <Link to="/words" className="inline-flex w-fit items-center gap-1 text-xs text-muted hover:text-accent">
        <ArrowLeft className="size-3.5" /> 入口に戻る
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{c.title}</h1>
          <p className="text-xs text-muted">
            {c.hint && `${c.hint}・`}
            {list.length.toLocaleString('ja-JP')} 語（よく使う順）
          </p>
        </div>
        <Button size="sm" onClick={() => void addTop()} disabled={added !== null}>
          {added === null ? 'まだの語を 20 語、学習に追加' : `追加しました（+${added}）`}
        </Button>
      </div>
      <Card className={cn('divide-y divide-border p-0')}>
        {list.slice(0, limit).map((e) => (
          <EntryRow key={e.key} e={e} />
        ))}
      </Card>
      {list.length > limit && (
        <Button className="w-full" onClick={() => setLimit((l) => l + 200)}>
          もっと見る（{limit} / {list.length}）
        </Button>
      )}
    </div>
  )
}
