import { Link, useParams } from '@tanstack/react-router'
import { ArrowRight, BookmarkPlus, Check, History, Mic } from 'lucide-react'
import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Card, SectionTitle } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { speak } from '@/lib/speech'
import { useSettings } from '@/stores/settings'
import { addToStudy, useStudyCard } from '@/features/study/cards'
import { headword } from './data'
import { EntryLink, LinkedText, MorphemeLink, SpeakButton } from './components/links'
import { recordView, useDictionary, useEntry, useEntryViews } from './hooks'
import type { Entry, Morpheme } from './types'
import { PageSpinner } from '@/components/ui/Spinner'
import { WordAiPanel } from '@/features/ai/WordAiPanel'
import { SpeakCheck, SpeakableRow } from '@/features/speech/SpeakCheck'
import { speechRecognitionSupported } from '@/features/speech/useSpeechCheck'

const POS_KEYS = ['noun', 'verb', 'adj', 'adv', 'prep', 'conj', 'pron', 'det', 'intj', 'num', 'phrase'] as const
type PosKey = (typeof POS_KEYS)[number] | 'other'
/** 品詞の略号（src/locales の pos） */
function posLabel(t: TFunction, p: string): string {
  const k: PosKey = (POS_KEYS as readonly string[]).includes(p) ? (p as PosKey) : 'other'
  return t(`pos.${k}`)
}

function PosBadge({ p }: { p: string }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-xs text-muted">
      {posLabel(t, p)}
    </span>
  )
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-5">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  )
}

function ChipList({ keys }: { keys: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((k) => (
        <EntryLink
          key={k}
          k={k}
          className="font-en rounded-lg border border-border bg-surface px-2.5 py-1 text-sm text-fg hover:border-accent hover:no-underline"
        />
      ))}
    </div>
  )
}

/** 代表的な訳（カタカナのみの音訳より意味を表す訳を優先） */
function mainGloss(entry: Entry) {
  const all = entry.g.flatMap((g) => g.ja)
  return all.find((x) => !/^[\u30a0-\u30ffー・]+$/.test(x)) ?? all[0]
}

/** 語の成り立ち: con（共に）+ struct（築く）→ 建設する */
function PartsView({ entry }: { entry: Entry }) {
  const dict = useDictionary()
  const parts = entry.parts ?? []
  return (
    <Card>
      <div className="flex flex-wrap items-stretch gap-1.5">
        {parts.map((p, i) => {
          const m = p.m && !p.m.startsWith('w:') ? dict.morphById.get(p.m) : null
          const base = p.m?.startsWith('w:') ? p.m.slice(2).replace(/ /g, '_') : null
          const baseGloss = base ? dict.byKey.get(base)?.gloss.split('、')[0] : null
          return (
            <div key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted">+</span>}
              {m ? (
                <Link
                  to="/m/$id"
                  params={{ id: m.id }}
                  className="flex flex-col items-center rounded-xl bg-accent-soft px-3 py-1.5 hover:opacity-80"
                >
                  <span className="font-en text-lg font-semibold text-accent">{p.s}</span>
                  <span className="text-[11px] text-muted">{m.meaning.ja}</span>
                  {m.parts && (
                    <span className="mt-0.5 text-[10px] text-muted">
                      = {m.parts.map((x) => dict.morphById.get(x)?.label ?? '').join(' + ')}
                    </span>
                  )}
                </Link>
              ) : base && dict.byKey.has(base) ? (
                <Link
                  to="/e/$key"
                  params={{ key: base }}
                  className="flex flex-col items-center rounded-xl border border-border px-3 py-1.5 hover:border-accent"
                >
                  <span className="font-en text-lg font-semibold">{p.s}</span>
                  <span className="text-[11px] text-muted">{baseGloss}</span>
                </Link>
              ) : (
                <span className="font-en flex items-center px-1 text-lg text-muted">{p.s}</span>
              )}
            </div>
          )
        })}
        <div className="flex items-center gap-1.5">
          <ArrowRight className="size-4 text-muted" />
          <span className="text-sm">{mainGloss(entry)}</span>
        </div>
      </div>
    </Card>
  )
}

function SameRoot({ entry }: { entry: Entry }) {
  const dict = useDictionary()
  const { t } = useTranslation()
  const ms = [
    ...(entry.parts ?? []).map((p) => (p.m && !p.m.startsWith('w:') ? dict.morphById.get(p.m) : undefined)),
    ...(entry.pie ?? []).map((id) => dict.morphById.get(id)),
  ].filter((m): m is Morpheme => !!m && m.words.length > 1)
  // 語根 → 祖語 → 接辞の順（接尾辞などは語数が多くなりやすいので後ろへ）
  const order = { root: 0, particle: 0, pie: 1, prefix: 2, suffix: 3 }
  ms.sort((a, b) => order[a.type] - order[b.type])
  if (!ms.length) return null
  return (
    <Section title={t('words.sameRoot')}>
      <div className="flex flex-col gap-3">
        {ms.map((m) => (
          <Card key={m.id} className="p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <MorphemeLink m={m} />
              <Link to="/m/$id" params={{ id: m.id }} className="text-xs text-muted hover:text-accent">
                {t('common.count', { count: m.words.length })} →
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {m.words
                .filter((w) => w !== entry.k)
                .slice(0, 14)
                .map((w) => (
                  <span key={w} className="text-sm">
                    <EntryLink k={w} className="font-en" />
                    <span className="ml-1 text-xs text-muted">{dict.byKey.get(w)?.gloss.split('、')[0]}</span>
                  </span>
                ))}
            </div>
          </Card>
        ))}
      </div>
    </Section>
  )
}

function ViewHistory({ entryKey }: { entryKey: string }) {
  const { t } = useTranslation()
  const views = useEntryViews(entryKey)
  if (!views?.length) return null
  const fmt = (n: number) => new Date(n).toLocaleString('ja-JP')
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1.5">
          <History className="size-4" /> {t('words.history')}
        </span>
      }
    >
      <Card className="p-3 text-sm">
        <div className="mb-1">{t('words.viewedCount', { count: views.length })}</div>
        <div className="text-xs text-muted">
          {t('words.firstViewed')}: {fmt(views[views.length - 1].viewedAt)}
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted">{t('common.more')}</summary>
          <ul className="mt-1 max-h-48 overflow-auto font-mono text-xs text-muted">
            {views.map((v) => (
              <li key={v.id}>{fmt(v.viewedAt)}</li>
            ))}
          </ul>
        </details>
      </Card>
    </Section>
  )
}

function StudyButton({ entryKey }: { entryKey: string }) {
  const { t } = useTranslation()
  const card = useStudyCard(entryKey)
  if (card === undefined) return null
  return card ? (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-success/15 px-3 text-sm text-success">
      <Check className="size-4" /> {t('words.inStudy')}
    </span>
  ) : (
    <button
      type="button"
      onClick={() => addToStudy(entryKey)}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm text-accent-fg hover:opacity-90"
    >
      <BookmarkPlus className="size-4" /> {t('words.addToStudy')}
    </button>
  )
}

function EntryView({ entryKey }: { entryKey: string }) {
  const { t } = useTranslation()
  const entry = useEntry(entryKey)
  const autoSpeak = useSettings((s) => s.autoSpeak)
  // 見出し語の発音チェック欄（別の語へ移ったら閉じる）
  const [practice, setPractice] = useState(false)
  useEffect(() => setPractice(false), [entryKey])

  useEffect(() => {
    if (!entry) return
    void recordView(entry.k)
    if (autoSpeak) speak(headword(entry.k))
  }, [entry, autoSpeak])

  if (!entry) return <p className="text-muted">{t('common.notFound')}</p>

  const hl = new Set([entry.h.toLowerCase(), ...(entry.forms ?? []).map((f) => f.toLowerCase())])

  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <h1 className="vt-headword font-en break-words text-3xl font-semibold tracking-tight">{entry.h}</h1>
            <SpeakButton text={entry.h} />
            {speechRecognitionSupported() && (
              <button
                type="button"
                onClick={() => setPractice((v) => !v)}
                aria-label="発音してみる"
                title="発音してみる"
                aria-expanded={practice}
                className={
                  'inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface-2 hover:text-accent ' +
                  (practice ? 'text-accent' : 'text-muted')
                }
              >
                <Mic className="size-5" />
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            {entry.ipas && entry.ipas.length > 1 ? (
              // 意味によって発音が変わる語は、品詞と意味の手がかりを添えて並べる
              entry.ipas.map((x) => (
                <span key={x.ipa} className="inline-flex items-baseline gap-1">
                  <span className="font-en">{x.ipa}</span>
                  <span className="text-xs">
                    {x.p?.map((p) => posLabel(t, p)).join('・')}
                    {x.ja && `「${x.ja}」`}
                  </span>
                </span>
              ))
            ) : (
              entry.ipa && <span className="font-en">{entry.ipa}</span>
            )}
            <span className="rounded-md bg-surface-2 px-1.5 text-xs">
              {entry.t === 'p' ? '熟語' : t('words.rank')} #{entry.r}
            </span>
            {entry.ngsl && <span className="rounded-md bg-accent-soft px-1.5 text-xs text-accent">NGSL</span>}
            {entry.toeic && (
              <Link
                to="/words"
                search={{ c: 't' + entry.toeic.lv }}
                className="rounded-md bg-surface-2 px-1.5 text-xs hover:text-accent"
                title="TOEIC のレベルの目安（一般の頻度と TOEIC Service List から推定）"
              >
                TOEIC {entry.toeic.lv}
                {entry.toeic.tsl && <span className="ml-1 text-accent">頻出</span>}
              </Link>
            )}
          </div>
        </div>
        <StudyButton entryKey={entry.k} />
      </div>
      {practice && (
        <Card className="mt-3 p-3">
          <SpeakCheck key={entry.k} target={entry.h} autoStart />
        </Card>
      )}

      <Section title={t('words.meaning')}>
        <Card className="flex flex-col gap-2 p-3">
          {entry.g.map((g, i) => (
            <div key={i} className="flex items-start gap-2">
              <PosBadge p={g.p} />
              <span>{g.ja.join('、')}</span>
            </div>
          ))}
          {!!entry.d?.length && (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer text-xs text-muted">English definitions</summary>
              <ul className="mt-1 space-y-1">
                {entry.d.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <PosBadge p={d.p} />
                    <span className="font-en text-muted">
                      {d.en.map((x, j) => (
                        <span key={j} className="block">
                          <LinkedText text={x} />
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      </Section>

      {entry.parts && (
        <Section title={t('words.parts')}>
          <PartsView entry={entry} />
        </Section>
      )}

      {entry.note && (
        <Section title="解説">
          <Card className="p-3 text-sm leading-relaxed">
            <LinkedText text={entry.note.ja} />
          </Card>
        </Section>
      )}

      {!entry.parts && entry.comp && entry.comp.length > 0 && (
        <Section title={t('words.parts')}>
          <ChipList keys={entry.comp} />
        </Section>
      )}

      {!!entry.ex?.length && (
        <Section title={t('words.examples')}>
          <div className="flex flex-col gap-2">
            {entry.ex.map((ex) => (
              <Card key={ex.id} className="p-3">
                <SpeakableRow target={ex.en} actions={<SpeakButton text={ex.en} size="sm" />}>
                  <p className="font-en leading-relaxed">
                    <LinkedText text={ex.en} highlight={hl} />
                  </p>
                  <p className="mt-0.5 text-sm text-muted">{ex.ja}</p>
                  {ex.o === 1 && <p className="mt-1 text-[10px] text-muted">アプリのオリジナル例文</p>}
                </SpeakableRow>
              </Card>
            ))}
          </div>
        </Section>
      )}

      <SameRoot entry={entry} />

      {!!entry.ph?.length && (
        <Section title={t('words.phrases')}>
          <ChipList keys={entry.ph} />
        </Section>
      )}
      {!!entry.der?.length && (
        <Section title={t('words.derived')}>
          <ChipList keys={entry.der} />
        </Section>
      )}
      {!!entry.syn?.length && (
        <Section title={t('words.synonyms')}>
          <ChipList keys={entry.syn} />
        </Section>
      )}
      {!!entry.ant?.length && (
        <Section title={t('words.antonyms')}>
          <ChipList keys={entry.ant} />
        </Section>
      )}
      {!!entry.rel?.length && (
        <Section title={t('words.related')}>
          <ChipList keys={entry.rel} />
        </Section>
      )}
      {!!entry.forms?.length && (
        <Section title={t('words.forms')}>
          <p className="font-en text-sm text-muted">{entry.forms.join(' · ')}</p>
        </Section>
      )}
      {entry.ety && (
        <Section title={t('words.etymology')}>
          <details className="rounded-2xl border border-border bg-surface p-3 text-sm">
            <summary className="cursor-pointer text-muted">Etymology (Wiktionary)</summary>
            <p className="font-en mt-2 leading-relaxed text-muted">{entry.ety}</p>
          </details>
        </Section>
      )}

      <WordAiPanel entryKey={entry.k} />

      <ViewHistory entryKey={entry.k} />
    </>
  )
}

export function EntryPage() {
  const { key } = useParams({ from: '/e/$key' })
  return (
    <Page>
      <Suspense fallback={<PageSpinner />}>
        <EntryView key={key} entryKey={key} />
      </Suspense>
    </Page>
  )
}

