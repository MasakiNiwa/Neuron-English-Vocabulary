import { Link, useNavigate } from '@tanstack/react-router'
import { scrollBehavior } from '@/lib/motion'
import * as Comlink from 'comlink'
import { useLiveQuery } from 'dexie-react-hooks'
import { Dumbbell, Lightbulb, ListTodo, TrendingUp, X } from 'lucide-react'
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
import { getStudyStats, shuffle } from '@/features/study/session'
import { useStudySession } from '@/features/study/sessionStore'
import { loadDictionary } from '@/features/dictionary/data'
import { Segmented } from '@/components/ui/Form'
import { useMinuteTick } from '@/lib/clock'
import type { AnalyticsApi } from './analytics.worker'
import type { AnalyticsResult, PeriodStats } from './compute'
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
  // 件数が同じままの変化（FSRS-7 への移行・復元・保留の切り替えなど）でも集計し直すよう、カードの中身からも印を作る
  const version = useLiveQuery(async () => {
    let sig = 0
    await db.cards.each((c) => (sig = (sig * 31 + c.reps * 7 + (c.model ?? 6) + (c.suspended ?? 0) * 3 + (c.due % 100003)) % 2147483647))
    return `${await db.views.count()}|${await db.reviews.count()}|${await db.cards.count()}|${sig}`
  }, [])
  const [data, setData] = useState<AnalyticsResult | null>(null)
  useEffect(() => {
    if (version === undefined) return
    let alive = true
    void getApi()
      .run(document.baseURI, retention, !useSettings.getState().showSensitive)
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
  // 学習中の語は「練習」、まだカードにしていない語は「学習に追加」
  const inStudy = useLiveQuery(async () => new Set((await db.cards.bulkGet(drill.keys)).filter((c) => c && !c.suspended).map((c) => c!.entryId)), [drill.keys])
  const studyKeys = list.filter((e) => inStudy?.has(e.key)).map((e) => e.key)
  const newKeys = list.filter((e) => inStudy && !inStudy.has(e.key)).map((e) => e.key)
  const practice = usePracticeKeys()
  return (
    <Card className="border-accent/40 p-0">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{drill.title}</h3>
        {drill.morph && (
          <Link to="/m/$id" params={{ id: drill.morph }} className="text-xs text-accent">
            語根ページ
          </Link>
        )}
        {studyKeys.length > 0 && (
          <Button size="sm" onClick={() => void practice.run(studyKeys)} title="学習中の語から 5 語を練習">
            {practice.active ? '学習の続き' : '5 語練習'}
          </Button>
        )}
        {newKeys.length > 0 && (
          <Button size="sm" variant={studyKeys.length ? 'ghost' : undefined} onClick={async () => setAdded(await addManyToStudy(newKeys.slice(0, 50)))} title="まだカードにしていない語を学習に追加（最大 50 語）">
            {added === null ? `学習に追加（${Math.min(50, newKeys.length)}）` : `+${added}`}
          </Button>
        )}
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

/**
 * 分析から、決まった語だけをすぐ練習する（いつもの学習画面を使う。回答は自由練習と同じく復習予定に反映）。
 * 学習の途中なら、上書きせずにその続きを開く
 */
export function usePracticeKeys() {
  const navigate = useNavigate()
  const active = useStudySession((s) => !!s.queue)
  const start = useStudySession((s) => s.start)
  const run = async (keys: string[], n = 5) => {
    if (useStudySession.getState().queue) return void navigate({ to: '/study' })
    const { hidden } = await loadDictionary()
    const cards = (await db.cards.bulkGet(keys)).filter((c) => !!c && !c.suspended && !hidden.has(c.entryId)).slice(0, n)
    if (!cards.length) return
    start(shuffle(cards.map((c) => c!)), 'analysis')
    void navigate({ to: '/study' })
  }
  return { run, active }
}

/** 分析の結論として「次に何をするか」を先頭に出す（ROADMAP U07） */
function NextActions({ data, onDrill }: { data: AnalyticsResult; onDrill: (d: Drill) => void }) {
  const tick = useMinuteTick()
  const stats = useLiveQuery(getStudyStats, [tick])
  const practice = usePracticeKeys()
  const today = stats ? stats.due + stats.newAvailable : 0
  const stumbles = data.stumbles[7].length ? { days: 7, list: data.stumbles[7] } : { days: 28, list: data.stumbles[28] }
  const root = data.rootNext[0]
  const gap = data.insights.find((x) => x.kind === 'coverage')
  const actions: { key: string; title: string; detail: string; node: React.ReactNode }[] = []
  if (today > 0)
    actions.push({
      key: 'study',
      title: `今日の学習 ${today} 枚`,
      detail: '復習の時期が来たカードと、追加済みの新しいカード',
      node: (
        <Link to="/study" className="inline-flex h-8 shrink-0 items-center rounded-lg bg-accent px-3 text-xs font-medium text-accent-fg">
          学習する
        </Link>
      ),
    })
  if (stumbles.list.length)
    actions.push({
      key: 'stumble',
      title: `最近つまずいた語を ${Math.min(5, stumbles.list.length)} 語だけ練習`,
      detail: `最近 ${stumbles.days} 日で「もう一度」を選んだ ${stumbles.list.length} 語：${stumbles.list
        .slice(0, 4)
        .map((s) => s.key.replace(/_/g, ' '))
        .join('、')}`,
      node: (
        <span className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => onDrill({ title: `最近 ${stumbles.days} 日でつまずいた語`, keys: stumbles.list.map((s) => s.key) })}>
            一覧
          </Button>
          <Button size="sm" onClick={() => void practice.run(stumbles.list.map((s) => s.key))}>
            {practice.active ? '学習の続き' : '練習'}
          </Button>
        </span>
      ),
    })
  if (root)
    actions.push({
      key: 'root',
      title: `語根「${root.label}（${root.meaning}）」から次の語へ`,
      detail: `日をあけて思い出せた語が ${root.recalled} 語。同じ語根の語があと ${root.candidates.length} 語あります`,
      node: (
        <Button size="sm" className="shrink-0" onClick={() => onDrill({ title: `語根 ${root.label}（${root.meaning}）の次の語`, keys: root.candidates, morph: root.id })}>
          候補
        </Button>
      ),
    })
  else if (gap?.keys?.length)
    actions.push({
      key: 'gap',
      title: '次に学ぶ単語の候補',
      detail: gap.text,
      node: (
        <Button size="sm" className="shrink-0" onClick={() => onDrill({ title: '次に学ぶ単語の候補', keys: gap.keys! })}>
          候補
        </Button>
      ),
    })
  if (!actions.length) return null
  return (
    <Card>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
        <ListTodo className="size-4" /> 次にすること
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {actions.slice(0, 3).map((a) => (
          <li key={a.key} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{a.title}</div>
              <div className="line-clamp-2 text-xs text-muted">{a.detail}</div>
            </div>
            {a.node}
          </li>
        ))}
      </ul>
    </Card>
  )
}

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)

/** 最近の変化（7 日・28 日）。回答・自己評価・日をあけて思い出せた語 */
function RecentChanges({ data, onDrill }: { data: AnalyticsResult; onDrill: (d: Drill) => void }) {
  const [days, setDays] = usePersistentState<'7' | '28'>('analytics:recentDays', '7')
  const p: PeriodStats = data.recent[days === '7' ? 7 : 28]
  const practice = usePracticeKeys()
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex flex-1 items-center gap-1.5 text-sm font-semibold text-muted">
          <TrendingUp className="size-4" /> 最近の変化
        </h2>
        <Segmented
          value={days}
          onChange={setDays}
          options={[
            { value: '7', label: '7 日' },
            { value: '28', label: '28 日' },
          ]}
        />
      </div>
      {p.answers === 0 ? (
        <p className="text-sm text-muted">最近 {p.days} 日の回答はまだありません。</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
            <Tile label="回答数" value={p.answers} hint="同じ語の繰り返しも数えます" />
            <Tile label="回答した語" value={p.words} />
            <Tile label="学習した日" value={`${p.studyDays}日`} />
            <Tile label="思い出せた割合" value={pct(p.recalled)} hint="「難しい」「正解」「簡単」を選んだ割合（自分の評価。テストの正答率とは別）" />
            <Tile label="正解・簡単の割合" value={pct(p.goodEasy)} hint="「正解」か「簡単」を選んだ割合（「難しい」は含めない）" />
          </div>
          {p.spacedRecall.length > 0 && (
            <button
              type="button"
              onClick={() => onDrill({ title: `最近 ${p.days} 日に、日をあけて思い出せた語`, keys: p.spacedRecall })}
              className="mt-3 flex w-full items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-left text-sm hover:opacity-90"
            >
              <span className="flex-1">
                日をあけて思い出せた語 <strong>{p.spacedRecall.length}</strong> 語
                {data.recovered.length > 0 && <span className="text-xs text-muted">（前に間違えた語のうち {data.recovered.length} 語も、別の日に思い出せました）</span>}
              </span>
              <span className="shrink-0 text-xs text-accent">一覧 →</span>
            </button>
          )}
          {!p.enough && <p className="mt-2 text-xs text-muted">まだ記録が少ないため、傾向は表示していません（回答 20 件・5 語・2 日以上で表示）。</p>}
          {p.enough && data.stumbles[p.days as 7 | 28].length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 text-xs text-muted">
                この {p.days} 日でつまずいた語 {data.stumbles[p.days as 7 | 28].length} 語（そのあと別の日に思い出せた語は除く）
              </span>
              <Button size="sm" onClick={() => void practice.run(data.stumbles[p.days as 7 | 28].map((s) => s.key))}>
                <Dumbbell className="size-3.5" /> 5 語練習
              </Button>
            </div>
          )}
        </>
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
      <NextActions data={data} onDrill={setDrill} />
      <RecentChanges data={data} onDrill={setDrill} />
      <h2 className="-mb-2 text-xs font-semibold text-muted">これまでの合計</h2>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        <Tile label="閲覧した語" value={t.uniqueViewed} />
        <Tile label="閲覧回数" value={t.views} />
        <Tile label="学習カード" value={t.cards} />
        <Tile label="回答数" value={t.reviews} />
        <Tile
          label="正解・簡単の割合"
          value={pct(t.accuracy)}
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

      <Accordion defaultOpen={['memory']} persistKey="analytics">
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
