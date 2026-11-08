import { Link, useParams } from '@tanstack/react-router'
import { BookOpen, GitBranch, Network, Sparkles } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { addManyToStudy } from '@/features/study/cards'
import { MORPH_TYPE_LABEL, MorphemeLink, morphLabel } from './components/links'
import { EntryRow } from './components/EntryRow'
import { useDictionary } from './hooks'
import { markVisited } from '@/features/network/visited'
import type { Morpheme } from './types'
import { usePersistentState } from '@/lib/persist'

/** 語源の成り立ち: jud = jus（法）+ dic（言う） */
function PartsTree({ m }: { m: Morpheme }) {
  const dict = useDictionary()
  const parts = (m.parts ?? []).map((id) => dict.morphById.get(id)).filter((x): x is Morpheme => !!x)
  if (!parts.length) return null
  return (
    <section className="mb-4">
      <SectionTitle className="flex items-center gap-1.5">
        <GitBranch className="size-4" /> この語源の成り立ち
      </SectionTitle>
      <Card className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-en text-lg font-semibold">{morphLabel(m)}</span>
          <span className="text-muted">=</span>
          {parts.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted">+</span>}
              <MorphemeLink m={p} />
            </span>
          ))}
        </div>
        {m.partsNote && <p className="text-sm text-muted">{m.partsNote.ja}</p>}
        {/* 構成要素がさらに分解できる場合は 1 段だけ展開して見せる */}
        {parts
          .filter((p) => p.parts?.length)
          .map((p) => (
            <p key={p.id} className="text-xs text-muted">
              └ {morphLabel(p)} = {p.parts!.map((x) => dict.morphById.get(x)).filter(Boolean).map((x) => `${morphLabel(x!)}（${x!.meaning.ja}）`).join(' + ')}
            </p>
          ))}
      </Card>
    </section>
  )
}

function MorphList({ title, ids }: { title: string; ids?: string[] }) {
  const dict = useDictionary()
  const list = (ids ?? []).map((id) => dict.morphById.get(id)).filter((x): x is Morpheme => !!x)
  if (!list.length) return null
  return (
    <section className="mb-4">
      <SectionTitle>{title}</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {list.map((x) => (
          <MorphemeLink key={x.id} m={x} />
        ))}
      </div>
    </section>
  )
}

function MorphemeView({ id }: { id: string }) {
  const { t } = useTranslation()
  const dict = useDictionary()
  const m = dict.morphById.get(id)
  const [limit, setLimit] = usePersistentState('morph:limit:' + id, 60)
  const [added, setAdded] = useState<number | null>(null)
  if (!m) return <p className="text-muted">{t('common.notFound')}</p>
  const words = m.words.map((k) => dict.byKey.get(k)).filter((e) => !!e)
  return (
    <>
      <div className="mb-4">
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{MORPH_TYPE_LABEL[m.type]}</span>
        <h1 className="vt-headword font-en mt-2 text-3xl font-semibold">{morphLabel(m)}</h1>
        <p className="mt-1 text-lg">{m.meaning.ja}</p>
        <p className="mt-1 text-sm text-muted">
          {t('words.origin')}: {m.origin}
          {m.forms.length > 1 && <span className="font-en"> ・ {m.forms.join(', ')}</span>}
        </p>
        <Link
          to="/network"
          search={{ focus: 'm:' + m.id }}
          className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <Network className="size-3.5" /> つながりで見る
        </Link>
        {m.type === 'root' && m.words.length >= 5 && (
          <Link
            to="/lesson/$id"
            params={{ id: m.id }}
            className="ml-3 mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <Sparkles className="size-3.5" /> この語根のレッスン
          </Link>
        )}
      </div>

      {m.story && (
        <Card className="mb-4 p-3 text-sm leading-relaxed">
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-accent">
            <BookOpen className="size-3.5" /> {m.type === 'prefix' ? '接頭辞の物語' : m.type === 'suffix' ? '接尾辞の物語' : m.type === 'pie' ? '祖語の物語' : '語根の物語'}
          </div>
          {m.story.ja}
        </Card>
      )}
      {m.desc && (
        <Card className="mb-4 p-3 text-sm leading-relaxed">
          <span className="mr-1 text-xs text-accent">イメージ</span>
          {m.desc.ja}
        </Card>
      )}
      <PartsTree m={m} />
      <MorphList title="この語源を含む語源" ids={m.partOf} />
      <MorphList title="祖語（さらに古い祖先）" ids={m.family} />
      <MorphList title="この祖語から生まれた語根" ids={m.members} />

      {words.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">
              {m.type === 'pie' ? 'この祖語に由来する単語' : m.type === 'particle' ? 'この不変化詞を使う熟語' : t('words.wordsWithRoot')}（{words.length}）
            </h2>
            <Button size="sm" onClick={async () => setAdded(await addManyToStudy(words.slice(0, 50).map((w) => w.key)))}>
              {added === null ? t('words.addToStudy') : `+${added}`}
            </Button>
          </div>
          <Card className="divide-y divide-border p-0">
            {words.slice(0, limit).map((e) => (
              <EntryRow key={e.key} e={e} />
            ))}
          </Card>
          {words.length > limit && (
            <Button className="mt-3 w-full" onClick={() => setLimit((l) => l + 100)}>
              {t('common.more')}
            </Button>
          )}
        </>
      )}
    </>
  )
}

export function MorphemePage() {
  const { id } = useParams({ from: '/m/$id' })
  // 語根めぐり: 語根のページを開いたら訪れたことにする
  useEffect(() => markVisited(id), [id])
  return (
    <Page>
      <Suspense fallback={<PageSpinner />}>
        <MorphemeView key={id} id={id} />
      </Suspense>
    </Page>
  )
}
