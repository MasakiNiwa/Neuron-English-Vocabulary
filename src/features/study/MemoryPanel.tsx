import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo } from 'react'
import { EChart, type chartColors } from '@/features/analytics/EChart'
import { useMinuteTick } from '@/lib/clock'
import { db, type ReviewRecord, type StudyCard } from '@/lib/db'
import { useSettings } from '@/stores/settings'
import { FORMAT_LABEL, type ConcreteFormat } from './formatDefs'
import { modelOf, recallCurve } from './srs'

/**
 * 単語ページの「記憶の見通し」: 復習しなかった場合の思い出せる見込み（忘却曲線）と、回答の記録。
 * FSRS-7 のカードは「詳しい計算」を開くと、すぐ薄れる成分・長く残る成分を別々に見られる
 */

const RATING = ['', 'もう一度', '難しい', '正解', '簡単']
const RATING_CLASS = ['', 'text-danger', 'text-warn', 'text-success', 'text-accent']
const MODE_LABEL: Record<string, string> = { review: '復習', learn: '新しく', practice: '練習', analysis: '分析から練習' }
const DAY = 86_400_000

const pct = (x: number) => `${Math.round(x * 100)}%`
const md = (t: number) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** カードの今の回（削除して追加し直す前の回答は含めない）の回答 */
function useHistory(c: StudyCard) {
  return useLiveQuery(async () => {
    const logs = await db.reviews.where('entryId').equals(c.entryId).toArray()
    return logs
      .filter((l) => (c.run && l.run ? l.run === c.run : l.reviewedAt >= c.addedAt - 60_000))
      .sort((a, b) => b.reviewedAt - a.reviewedAt)
  }, [c.entryId, c.run, c.addedAt, c.reps])
}

function formatOf(l: ReviewRecord): string {
  const [mode, fmt] = (l.mode ?? '').split(':')
  const f = FORMAT_LABEL[fmt as ConcreteFormat]
  return [MODE_LABEL[mode] ?? '', f ?? ''].filter(Boolean).join('・') || '—'
}

export default function MemoryPanel({ card }: { card: StudyCard }) {
  const tick = useMinuteTick()
  const target = useSettings((s) => s.desiredRetention)
  const history = useHistory(card)
  const now = useMemo(() => new Date(), [tick, card.reps]) // eslint-disable-line react-hooks/exhaustive-deps
  const dueIn = (card.due - now.getTime()) / DAY
  const horizon = Math.min(365, Math.max(14, Math.ceil(Math.max(dueIn, 1) * 2)))
  const curve = useMemo(() => recallCurve(card, now, horizon), [card, now, horizon])
  const fsrs7 = modelOf(card) === 7
  const yMin = curve ? Math.max(0, Math.floor((Math.min(target, ...curve.points.map((p) => p.r)) - 0.05) * 10) / 10) : 0

  const mainOpt = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => pct(Number(v)) },
      grid: { left: 40, right: 12, top: 16, bottom: 28 },
      xAxis: {
        type: 'value',
        min: 0,
        max: horizon,
        axisLabel: { color: c.muted, fontSize: 10, formatter: (v: number) => (v === 0 ? '今' : md(now.getTime() + v * DAY)) },
        axisLine: { lineStyle: { color: c.border } },
        splitLine: { show: false },
      },
      // 下がり方が見えるように、見込みの範囲に合わせる（目標の線も入るように）
      yAxis: { type: 'value', min: yMin, max: 1, axisLabel: { color: c.muted, formatter: (v: number) => pct(v) }, splitLine: { lineStyle: { color: c.border } } },
      series: [
        {
          type: 'line',
          name: '思い出せる見込み',
          showSymbol: false,
          smooth: true,
          lineStyle: { color: c.accent, width: 2 },
          areaStyle: { color: c.accentSoft },
          data: curve?.points.map((p) => [p.days, p.r]) ?? [],
          markLine: {
            symbol: 'none',
            silent: true,
            label: { color: c.muted, fontSize: 10 },
            data: [
              { yAxis: target, name: '目標', lineStyle: { color: c.success, type: 'dashed' }, label: { formatter: `目標 ${pct(target)}`, position: 'insideStartTop' } },
              ...(dueIn > 0 && dueIn <= horizon
                ? [{ xAxis: dueIn, lineStyle: { color: c.warn, type: 'dashed' }, label: { formatter: '次の復習', position: 'insideEndTop' } }]
                : []),
            ],
          },
        },
      ],
    }),
    [curve, horizon, target, dueIn, now, yMin],
  )

  const traceOpt = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => pct(Number(v)) },
      legend: { bottom: 0, textStyle: { color: c.muted, fontSize: 10 } },
      grid: { left: 40, right: 12, top: 12, bottom: 44 },
      xAxis: { type: 'value', min: 0, max: horizon, axisLabel: { color: c.muted, fontSize: 10, formatter: (v: number) => (v === 0 ? '今' : md(now.getTime() + v * DAY)) }, splitLine: { show: false } },
      yAxis: { type: 'value', min: 0, max: 1, axisLabel: { color: c.muted, formatter: (v: number) => pct(v) }, splitLine: { lineStyle: { color: c.border } } },
      series: [
        { type: 'line', name: '長く残る成分', showSymbol: false, smooth: true, lineStyle: { color: c.root, width: 2 }, data: curve?.points.map((p) => [p.days, p.slow]) ?? [] },
        { type: 'line', name: 'すぐ薄れる成分', showSymbol: false, smooth: true, lineStyle: { color: c.warn, width: 2 }, data: curve?.points.map((p) => [p.days, p.fast]) ?? [] },
      ],
    }),
    [curve, horizon, now],
  )

  if (!curve) return null
  const rNow = curve.points[0].r
  const atDue = dueIn > 0 ? recallCurve(card, now, dueIn, 1)?.points[1]?.r : undefined
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-2 px-2 py-2">
          <div className="text-lg font-semibold">{pct(rNow)}</div>
          <div className="text-[11px] text-muted">今、思い出せる見込み</div>
        </div>
        <div className="rounded-xl bg-surface-2 px-2 py-2">
          <div className="text-lg font-semibold">{dueIn <= 0 ? '今' : md(card.due)}</div>
          <div className="text-[11px] text-muted">次の復習</div>
        </div>
        <div className="rounded-xl bg-surface-2 px-2 py-2">
          <div className="text-lg font-semibold">{atDue === undefined ? '—' : pct(atDue)}</div>
          <div className="text-[11px] text-muted">そのときの見込み</div>
        </div>
      </div>
      <EChart option={mainOpt} height={200} />
      <p className="text-xs leading-relaxed text-muted">
        復習しなかった場合の推定です。次の復習日は、見込みが目標（{pct(target)}）のあたりまで下がる日を目安に決まります。回答すると曲線は引き直されます。
        {!fsrs7 && '（このカードは以前の記録を引き継いで学習しています）'}
      </p>
      {fsrs7 && curve.slowShare !== undefined && (
        <details className="rounded-xl border border-border px-3 py-2">
          <summary className="cursor-pointer select-none text-xs text-muted">詳しい計算（FSRS-7 の 2 つの成分）</summary>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            FSRS-7 は、すぐ薄れる成分と長く残る成分の 2 つを組み合わせて見込みを出します（今は長く残る成分の重みが {pct(curve.slowShare)}）。
            同じ日の繰り返しは主にすぐ薄れる成分を、日をあけた復習は長く残る成分を伸ばします。どちらも計算上の成分で、記憶力を測った値ではありません。
          </p>
          <EChart option={traceOpt} height={190} />
        </details>
      )}
      {history && history.length > 0 && (
        <details>
          <summary className="cursor-pointer select-none text-xs text-muted">回答の記録（{history.length} 回）</summary>
          <table className="mt-2 w-full text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 text-left font-normal">日時</th>
                <th className="py-1 text-left font-normal">評価</th>
                <th className="py-1 text-left font-normal">形式</th>
                <th className="py-1 text-right font-normal" title="回答する直前の推定（v2.0 から記録）">直前の見込み</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.slice(0, 30).map((l) => (
                <tr key={l.id ?? l.reviewedAt}>
                  <td className="py-1 font-mono">
                    {md(l.reviewedAt)} {new Date(l.reviewedAt).toTimeString().slice(0, 5)}
                  </td>
                  <td className={`py-1 ${RATING_CLASS[l.rating] ?? ''}`}>{RATING[l.rating] ?? l.rating}</td>
                  <td className="py-1 text-muted">{formatOf(l)}</td>
                  <td className="py-1 text-right font-mono text-muted">{l.recall === undefined ? (l.state === 0 ? '初回' : '—') : pct(l.recall)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}
