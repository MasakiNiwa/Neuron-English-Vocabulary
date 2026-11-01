import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Suspense, useDeferredValue, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { SearchField } from '@/components/ui/SearchField'
import { PageSpinner } from '@/components/ui/Spinner'
import { Segmented } from '@/components/ui/Form'
import { EntryRow } from '@/features/dictionary/components/EntryRow'
import { MORPH_TYPE_LABEL, morphLabel } from '@/features/dictionary/components/links'
import { useDictionary } from '@/features/dictionary/hooks'
import { searchDictionary, type SearchFilter, type SearchHit } from '@/features/dictionary/search'
import type { Morpheme } from '@/features/dictionary/types'
import type { WordsSearch } from './search'

function MorphemeRow({ m }: { m: Morpheme }) {
  return (
    <Link to="/m/$id" params={{ id: m.id }} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2">
      <span className="font-en w-20 shrink-0 font-medium text-accent">{morphLabel(m)}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{m.meaning.ja}</span>
      <span className="shrink-0 text-xs text-muted">{m.words.length}</span>
    </Link>
  )
}

function Browse({ filter }: { filter: SearchFilter }) {
  const dict = useDictionary()
  const { t } = useTranslation()
  const [limit, setLimit] = useState(100)
  useEffect(() => {
    setLimit(100)
  }, [filter])
  if (filter === 'm') {
    const groups = (['root', 'prefix', 'suffix', 'pie'] as const).map((type) => ({
      type,
      list: dict.morphemes.filter((m) => m.type === type && m.words.length > 0).sort((a, b) => b.words.length - a.words.length),
    }))
    return (
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <section key={g.type}>
            <h2 className="mb-2 text-sm font-semibold text-muted">
              {MORPH_TYPE_LABEL[g.type]}（{g.list.length}）
            </h2>
            <Card className="divide-y divide-border p-0">
              {g.list.map((m) => (
                <MorphemeRow key={m.id} m={m} />
              ))}
            </Card>
          </section>
        ))}
      </div>
    )
  }
  const list = dict.entries.filter((e) => filter === 'all' || e.type === filter)
  return (
    <>
      <Card className="divide-y divide-border p-0">
        {list.slice(0, limit).map((e) => (
          <EntryRow key={e.key} e={e} />
        ))}
      </Card>
      {list.length > limit && (
        <Button className="mt-3 w-full" onClick={() => setLimit((l) => l + 200)}>
          {t('common.more')}（{limit} / {list.length}）
        </Button>
      )}
    </>
  )
}

function Results({ query, filter }: { query: string; filter: SearchFilter }) {
  const dict = useDictionary()
  const { t } = useTranslation()
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  useEffect(() => {
    let alive = true
    void searchDictionary(query, filter).then((h) => alive && setHits(h))
    return () => {
      alive = false
    }
  }, [query, filter])
  if (!hits) return <PageSpinner />
  if (!hits.length) return <p className="py-10 text-center text-muted">{t('words.noResults')}</p>
  return (
    <>
      <p className="mb-2 text-xs text-muted">{t('words.results', { count: hits.length })}</p>
      <Card className="divide-y divide-border p-0">
        {hits.map((h) => {
          if (h.kind === 'morpheme') {
            const m = dict.morphById.get(h.key)
            return m ? <MorphemeRow key={'m' + h.key} m={m} /> : null
          }
          const e = dict.byKey.get(h.key)
          return e ? <EntryRow key={h.key} e={e} /> : null
        })}
      </Card>
    </>
  )
}

export function WordsPage() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/words' }) as WordsSearch
  const navigate = useNavigate({ from: '/words' })
  const [q, setQ] = useState(search.q ?? '')
  const filter = search.f ?? 'all'
  const deferred = useDeferredValue(q)
  const inputRef = useRef<HTMLInputElement>(null)

  // URL に検索語を反映（戻る操作で検索結果に戻れるように）
  useEffect(() => {
    const id = setTimeout(() => {
      if ((search.q ?? '') !== q) void navigate({ to: '/words', search: { ...search, q: q || undefined }, replace: true })
    }, 300)
    return () => clearTimeout(id)
  }, [q, search, navigate])

  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) inputRef.current?.focus()
  }, [])

  return (
    <Page>
      <SearchField
        ref={inputRef}
        value={q}
        onValueChange={setQ}
        placeholder={t('words.searchPlaceholder')}
        className="mb-3"
        enterKeyHint="search"
      />
      <div className="mb-4 overflow-x-auto">
        <Segmented<SearchFilter>
          value={filter}
          onChange={(f) => void navigate({ to: '/words', search: { ...search, f: f === 'all' ? undefined : f }, replace: true })}
          options={[
            { value: 'all', label: t('words.filterAll') },
            { value: 'w', label: t('words.filterWord') },
            { value: 'p', label: t('words.filterPhrase') },
            { value: 'm', label: t('words.filterRoot') },
          ]}
        />
      </div>
      <Suspense fallback={<PageSpinner />}>
        {deferred.trim() ? <Results query={deferred} filter={filter} /> : <Browse filter={filter} />}
      </Suspense>
    </Page>
  )
}
