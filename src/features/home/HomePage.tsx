import { Link, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpenText, GraduationCap, Shuffle, Sparkles } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, SectionTitle } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { SearchField } from '@/components/ui/SearchField'
import { PageSpinner } from '@/components/ui/Spinner'
import { useMinuteTick } from '@/lib/clock'
import { getStudyStats } from '@/features/study/session'
import { EntryLink, LinkedText, MorphemeLink } from '@/features/dictionary/components/links'
import { useDictionary, useEntry, useRecentEntries } from '@/features/dictionary/hooks'

function dayIndex(n: number) {
  const d = new Date()
  const seed = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()
  return seed % n
}

function TodayRoot() {
  const { t } = useTranslation()
  const dict = useDictionary()
  const roots = useMemo(() => dict.morphemes.filter((m) => m.type === 'root' && m.words.length >= 4), [dict])
  if (!roots.length) return null
  const m = roots[dayIndex(roots.length)]
  return (
    <Card>
      <SectionTitle className="flex items-center gap-1.5">
        <Sparkles className="size-4" /> {t('home.randomRoot')}
      </SectionTitle>
      <MorphemeLink m={m} className="text-base" />
      <p className="mt-1 text-xs text-muted">{m.origin}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {m.words.slice(0, 8).map((w) => (
          <span key={w} className="text-sm">
            <EntryLink k={w} className="font-en" />
            <span className="ml-1 text-xs text-muted">{dict.byKey.get(w)?.gloss.split('、')[0]}</span>
          </span>
        ))}
      </div>
    </Card>
  )
}

function TodayNote() {
  const dict = useDictionary()
  const pool = useMemo(() => dict.entries.filter((e) => e.hasNote), [dict])
  const ie = pool.length ? pool[(dayIndex(pool.length) * 7919) % pool.length] : null
  return ie ? <TodayNoteCard entryKey={ie.key} /> : null
}

function TodayNoteCard({ entryKey }: { entryKey: string }) {
  const entry = useEntry(entryKey)
  if (!entry?.note) return null
  return (
    <Card>
      <SectionTitle className="flex items-center gap-1.5">
        <BookOpenText className="size-4" /> きょうの解説
      </SectionTitle>
      <div className="mb-1 flex items-baseline gap-2">
        <EntryLink k={entry.k} className="font-en text-lg font-semibold" />
        <span className="text-sm text-muted">{entry.g[0]?.ja.slice(0, 3).join('、')}</span>
      </div>
      <p className="text-sm leading-relaxed">
        <LinkedText text={entry.note.ja} />
      </p>
    </Card>
  )
}

function Recent() {
  const { t } = useTranslation()
  const dict = useDictionary()
  const recent = useRecentEntries(12)
  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionTitle>{t('home.continue')}</SectionTitle>
        <Link to="/history" className="text-xs text-muted hover:text-accent">
          {t('common.more')} →
        </Link>
      </div>
      {recent && recent.length === 0 && <p className="text-sm text-muted">{t('home.noHistory')}</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {recent?.filter((r) => !dict.hidden.has(r.entryId)).map((r) => (
          <span key={r.entryId} className="text-sm">
            <EntryLink k={r.entryId} className="font-en" />
            <span className="ml-1 text-xs text-muted">{dict.byKey.get(r.entryId)?.gloss.split('、')[0]}</span>
          </span>
        ))}
      </div>
    </Card>
  )
}

function StudySummary() {
  const { t } = useTranslation()
  // 学習画面の「今日の学習」と同じ数え方（復習の時期が来たカード＋追加済みの新しいカード。B03）
  const tick = useMinuteTick()
  const stats = useLiveQuery(getStudyStats, [tick])
  const due = stats ? stats.due + stats.newAvailable : undefined
  const total = stats?.total
  return (
    <Card className="flex items-center gap-4">
      <div className="flex-1">
        <SectionTitle>{t('home.todayReview')}</SectionTitle>
        <div className="text-2xl font-semibold">
          {due ?? '–'}
          <span className="ml-1 text-sm font-normal text-muted">/ {total ?? '–'}</span>
        </div>
      </div>
      <Link
        to="/study"
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
      >
        <GraduationCap className="size-4" /> {t('home.startStudy')}
      </Link>
    </Card>
  )
}

function RandomWord() {
  const { t } = useTranslation()
  const dict = useDictionary()
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => {
        const pool = dict.entries.filter((e) => e.type === 'w' && e.rank <= 5000)
        const e = pool[Math.floor(Math.random() * pool.length)]
        void navigate({ to: '/e/$key', params: { key: e.key } })
      }}
      className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent"
    >
      <Shuffle className="size-4" /> {t('home.randomWord')}
    </button>
  )
}

export function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  return (
    <Page>
      <div className="mb-4">
        <p className="text-sm leading-relaxed text-muted">{t('home.intro')}</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void navigate({ to: '/words', search: { q: q || undefined } })
        }}
      >
        <SearchField value={q} onValueChange={setQ} placeholder={t('home.searchPlaceholder')} enterKeyHint="search" />
      </form>
      <div className="mt-2 flex justify-end">
        <Suspense>
          <RandomWord />
        </Suspense>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <StudySummary />
        <Suspense fallback={<PageSpinner />}>
          <TodayRoot />
        </Suspense>
        <Suspense fallback={null}>
          <div className="md:col-span-2">
            <TodayNote />
          </div>
        </Suspense>
        <Suspense fallback={null}>
          <div className="md:col-span-2">
            <Recent />
          </div>
        </Suspense>
      </div>
    </Page>
  )
}
