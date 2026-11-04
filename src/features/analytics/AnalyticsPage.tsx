import { Link } from '@tanstack/react-router'
import { scrollBehavior } from '@/lib/motion'
import * as Comlink from 'comlink'
import { useLiveQuery } from 'dexie-react-hooks'
import { Lightbulb, X } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionSection } from '@/components/ui/Accordion'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { db } from '@/lib/db'
import { usePersistentState } from '@/lib/persist'
import { useSettings } from '@/stores/settings'
import { EntryRow } from '@/features/dictionary/components/EntryRow'
import { useDictionary } from '@/features/dictionary/hooks'
import { addManyToStudy } from '@/features/study/cards'
import type { AnalyticsApi } from './analytics.worker'
import type { AnalyticsResult } from './compute'
import { analyticsModules } from './modules'
import type { Drill } from './modules/types'

let api: Comlink.Remote<AnalyticsApi> | null = null
function getApi() {
  api ??= Comlink.wrap<AnalyticsApi>(new Worker(new URL('./analytics.worker.ts', import.meta.url), { type: 'module' }))
  return api
}

/** DB の変化を検知して再集計する */
function useAnalytics() {
  const retention = useSettings((s) => s.desiredRetention)
  const version = useLiveQuery(async () => `${await db.views.count()}|${await db.reviews.count()}|${await db.cards.count()}`, [])
  const [data, setData] = useState<AnalyticsResult | null>(null)
  useEffect(() => {
    if (version === undefined) return
    let alive = true
    void getApi()
      .run(document.baseURI, retention)
      .then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [version, retention])
  return data
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5" title={hint}>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  )
}

function DrillPanel({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const dict = useDictionary()
  const [limit, setLimit] = useState(50)
  const [added, setAdded] = useState<number | null>(null)
  const list = drill.keys.map((k) => dict.byKey.get(k)).filter((e) => !!e)
  return (
    <Card className="border-accent/40 p-0">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{drill.title}</h3>
        {drill.morph && (
          <Link to="/m/$id" params={{ id: drill.morph }} className="text-xs text-accent">
            語根ページ
          </Link>
        )}
        <Button size="sm" disabled={!list.length} onClick={async () => setAdded(await addManyToStudy(list.slice(0, 50).map((e) => e.key)))}>
          {added === null ? '学習に追加' : `+${added}`}
        </Button>
        <button type="button" onClick={onClose} aria-label="閉じる" className="text-muted hover:text-fg">
          <X className="size-4" />
        </button>
      </div>
      {list.length === 0 && <p className="p-3 text-sm text-muted">該当する単語はありません。</p>}
      <div className="max-h-96 divide-y divide-border overflow-auto">
        {list.slice(0, limit).map((e) => (
          <EntryRow key={e.key} e={e} />
        ))}
      </div>
      {list.length > limit && (
        <Button size="sm" variant="ghost" className="w-full" onClick={() => setLimit((l) => l + 100)}>
          もっと見る（{limit} / {list.length}）
        </Button>
      )}
    </Card>
  )
}

function AnalyticsInner() {
  const data = useAnalytics()
  const [drill, setDrill] = usePersistentState<Drill | null>('analytics:drill', null)
  useEffect(() => {
    if (drill) document.getElementById('drill')?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' })
  }, [drill])
  if (!data) return <PageSpinner />
  const t = data.totals
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        <Tile label="閲覧した語" value={t.uniqueViewed} />
        <Tile label="閲覧回数" value={t.views} />
        <Tile label="学習カード" value={t.cards} />
        <Tile label="回答数" value={t.reviews} />
        <Tile
          label="正答率"
          value={t.accuracy === null ? '–' : `${Math.round(t.accuracy * 100)}%`}
          hint="全回答のうち「正解」か「簡単」を選んだ割合（「難しい」「もう一度」は含めない）。自由練習の回答も含みます"
        />
        <Tile label="連続日数" value={t.streak} />
      </div>

      {data.insights.length > 0 && (
        <Card>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
            <Lightbulb className="size-4" /> 気づき
          </h2>
          <ul className="flex flex-col gap-2">
            {data.insights.map((ins, i) => (
              <li key={i} className="text-sm leading-relaxed">
                {ins.keys?.length ? (
                  <button
                    type="button"
                    className="text-left hover:text-accent"
                    onClick={() => setDrill({ title: ins.text.slice(0, 40), keys: ins.keys!, morph: ins.morph })}
                  >
                    {ins.text} <span className="text-xs text-accent">→ 一覧</span>
                  </button>
                ) : (
                  ins.text
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div id="drill">{drill && <DrillPanel key={drill.title} drill={drill} onClose={() => setDrill(null)} />}</div>

      <Accordion defaultOpen={['activity']} persistKey="analytics">
        {analyticsModules.map((m) => (
          <AccordionSection key={m.id} value={m.id} title={m.title}>
            <p className="mb-3 text-xs text-muted">{m.description}</p>
            <m.Component data={data} onDrill={setDrill} />
          </AccordionSection>
        ))}
      </Accordion>
    </div>
  )
}

export function AnalyticsPage() {
  const { t } = useTranslation()
  return (
    <Page title={t('analytics.title')} wide>
      <Suspense fallback={<PageSpinner />}>
        <AnalyticsInner />
      </Suspense>
    </Page>
  )
}
