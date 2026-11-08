import { Link } from '@tanstack/react-router'
import { ArrowLeft, BarChart3, Bot, CalendarDays, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { EChart, type chartColors } from '@/features/analytics/EChart'
import { AI_EVENTS, fetchDaily, fetchVisitorCount, ymd } from '@/lib/goatcounter'

/**
 * アプリ全体の利用状況（みんなの合計）。ヘルプのリンクから開く。
 * GoatCounter の公開カウンタから取る（数時間おきに更新。個人を特定する情報は扱わない）
 */

const SECTIONS: [string, string][] = [
  ['/word', '単語ページ'],
  ['/study', '学習'],
  ['/network', 'つながり'],
  ['/words', '単語一覧'],
  ['/ai', 'AI チャット'],
  ['/analytics', '分析'],
  ['/morpheme', '語根ページ'],
  ['/lesson', '語根レッスン'],
  ['/roots', '語根図鑑'],
  ['/history', '履歴'],
  ['/settings', '設定'],
  ['/help', 'ヘルプ'],
]
const AI_LABEL: Record<(typeof AI_EVENTS)[number], string> = {
  'ai-chat': 'AI チャット',
  'ai-advice': '学習のアドバイス',
  'ai-word': '単語ページで聞く',
}

interface Usage {
  total: number | null
  week: number | null
  month: number | null
  daily: { date: string; count: number | null }[]
  sections: { label: string; count: number }[]
  ai: { label: string; total: number; week: number }[]
}

function useUsage() {
  const [data, setData] = useState<Usage | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    const since = (days: number) => ymd(new Date(Date.now() - (days - 1) * 86_400_000))
    ;(async () => {
      const [total, week, month] = await Promise.all([fetchVisitorCount('/'), fetchVisitorCount('/', since(7)), fetchVisitorCount('/', since(30))])
      if (!alive) return
      if (total === null) return setFailed(true)
      const [daily, sections, aiTotal, aiWeek] = await Promise.all([
        fetchDaily('/', 30),
        Promise.all(SECTIONS.map(([p]) => fetchVisitorCount(p))),
        Promise.all(AI_EVENTS.map((e) => fetchVisitorCount(e))),
        Promise.all(AI_EVENTS.map((e) => fetchVisitorCount(e, since(7)))),
      ])
      if (!alive) return
      setData({
        total,
        week,
        month,
        daily,
        sections: SECTIONS.map(([, label], i) => ({ label, count: sections[i] ?? 0 }))
          .filter((s) => s.count > 0)
          .sort((a, b) => b.count - a.count),
        ai: AI_EVENTS.map((e, i) => ({ label: AI_LABEL[e], total: aiTotal[i] ?? 0, week: aiWeek[i] ?? 0 })),
      })
    })().catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])
  return { data, failed }
}

function Big({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | null | undefined; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? 'bg-accent text-accent-fg' : 'bg-surface-2'}`}>
      <div className={`flex items-center gap-1.5 text-xs ${accent ? 'opacity-90' : 'text-muted'}`}>
        {icon}
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">
        {value == null ? '…' : value.toLocaleString('ja-JP')}
        <span className="ml-1 text-sm font-normal">セッション</span>
      </div>
    </div>
  )
}

export function UsagePage() {
  const { data, failed } = useUsage()

  const dailyOpt = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'axis' },
      grid: { left: 32, right: 12, top: 16, bottom: 28 },
      xAxis: {
        type: 'category',
        data: data?.daily.map((d) => `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8))}`) ?? [],
        axisLabel: { color: c.muted, fontSize: 10 },
        axisLine: { lineStyle: { color: c.border } },
      },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.border } } },
      series: [
        {
          type: 'line',
          name: 'アクセス',
          smooth: 0.3,
          symbolSize: (v: number | null) => (v ? 7 : 0),
          lineStyle: { color: c.accent, width: 3 },
          itemStyle: { color: c.accent },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: c.accent + '66' }, { offset: 1, color: c.accent + '00' }] },
          },
          data: data?.daily.map((d) => d.count) ?? [],
        },
      ],
    }),
    [data],
  )
  const sectionOpt = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 84, right: 28, top: 4, bottom: 4 },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', inverse: true, data: data?.sections.map((s) => s.label) ?? [], axisLabel: { color: c.fg, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
      series: [
        {
          type: 'bar',
          barWidth: 14,
          label: { show: true, position: 'right', color: c.muted, fontSize: 10 },
          data: data?.sections.map((s, i) => ({ value: s.count, itemStyle: { color: c.series[i % c.series.length], borderRadius: [0, 7, 7, 0] } })) ?? [],
        },
      ],
    }),
    [data],
  )
  const aiOpt = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'item', formatter: '{b}: {c} セッション（{d}%）' },
      legend: { bottom: 0, textStyle: { color: c.muted, fontSize: 11 } },
      series: [
        {
          type: 'pie',
          radius: ['48%', '74%'],
          center: ['50%', '44%'],
          itemStyle: { borderColor: c.surface, borderWidth: 3, borderRadius: 6 },
          label: { color: c.fg, formatter: '{c}', fontSize: 11 },
          data: data?.ai.filter((a) => a.total > 0).map((a, i) => ({ name: a.label, value: a.total, itemStyle: { color: [c.accent, c.root, c.success][i] } })) ?? [],
        },
      ],
    }),
    [data],
  )

  const aiTotal = data?.ai.reduce((n, a) => n + a.total, 0) ?? 0
  const aiWeek = data?.ai.reduce((n, a) => n + a.week, 0) ?? 0
  return (
    <Page title="利用状況">
      <Link to="/help" className="-mt-2 mb-3 inline-flex items-center gap-1 text-sm text-accent">
        <ArrowLeft className="size-4" /> ヘルプ
      </Link>
      <p className="mb-4 text-sm text-muted">ニューロン英単語を使っているみんなの合計です。数はセッション単位です（同じ人がしばらくの間に何度開いたり使ったりしても 1 と数えます）。アクセスは、ホームを表示したセッションの数です。</p>
      {failed ? (
        <Card>
          <p className="text-sm text-muted">利用状況を読み込めませんでした。オフラインのときは表示されません。</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <Big accent icon={<Users className="size-3.5" />} label="これまでのアクセス" value={data?.total ?? null} />
            </div>
            <Big icon={<CalendarDays className="size-3.5" />} label="最近 30 日" value={data?.month ?? null} />
            <Big icon={<CalendarDays className="size-3.5" />} label="最近 7 日" value={data?.week ?? null} />
          </div>

          <Card>
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted">
              <CalendarDays className="size-4" /> 最近 30 日の推移
            </h2>
            {data ? <EChart option={dailyOpt} height={220} /> : <div className="h-[220px]" />}
          </Card>

          <Card>
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted">
              <BarChart3 className="size-4" /> よく使われている画面（これまで・セッション）
            </h2>
            {data && data.sections.length > 0 ? (
              <EChart option={sectionOpt} height={Math.max(120, data.sections.length * 26 + 16)} />
            ) : (
              <p className="text-sm text-muted">{data ? 'まだ記録がありません。' : '…'}</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted">
              <Bot className="size-4" /> AI 機能の利用
            </h2>
            <p className="mb-2 text-xs text-muted">
              AI 機能を使ったセッション：これまで {aiTotal.toLocaleString('ja-JP')}・最近 7 日 {aiWeek.toLocaleString('ja-JP')}（1 つのセッションで何度話しかけても 1。機能ごとに数えるので、合計はアクセスより多くなることがあります）
            </p>
            {aiTotal > 0 ? <EChart option={aiOpt} height={220} /> : <p className="text-sm text-muted">{data ? 'まだ記録がありません。' : '…'}</p>}
            {data && (
              <ul className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                {data.ai.map((a) => (
                  <li key={a.label} className="rounded-xl bg-surface-2 px-2 py-2">
                    <div className="text-base font-semibold tabular-nums">{a.week}</div>
                    <div className="text-muted">{a.label}（7 日）</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="text-[11px] leading-relaxed text-muted">
            GoatCounter の集計で、数時間おきに更新されます（今日の分はまだ入っていないことがあります）。送っているのは開いた画面の種類と AI 機能を使ったことだけで、単語名・学習内容・個人を特定する情報は送っていません。設定の「アクセス数の計測に協力する」で止められます。
          </p>
        </div>
      )}
    </Page>
  )
}
