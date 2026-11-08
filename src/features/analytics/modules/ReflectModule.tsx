import { useCallback } from 'react'
import { EChart, type chartColors } from '../EChart'
import type { ModuleProps } from './types'

const pct = (x: number) => `${Math.round(x * 100)}%`
/** 傾向を出す最低の件数（暫定の目安） */
const MIN_CAL = 30
const MIN_BUCKET = 5

/** 振り返り: 見込みと実際・同じ日と別の日・出題形式ごとの評価 */
export function ReflectModule({ data }: ModuleProps) {
  const r = data.reflect
  const cal = r.calibration.filter((b) => b.n >= MIN_BUCKET)
  const calOpt = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => pct(Number(v)) },
      legend: { bottom: 0, textStyle: { color: c.muted, fontSize: 10 } },
      grid: { left: 40, right: 8, top: 16, bottom: 44 },
      xAxis: { type: 'category', data: cal.map((b) => `${b.label}\n(${b.n})`), axisLabel: { color: c.muted, fontSize: 10 }, axisLine: { lineStyle: { color: c.border } } },
      yAxis: { type: 'value', min: 0, max: 1, axisLabel: { color: c.muted, formatter: (v: number) => pct(v) }, splitLine: { lineStyle: { color: c.border } } },
      series: [
        { type: 'bar', name: '回答直前の見込み', data: cal.map((b) => b.predicted), itemStyle: { color: c.surface2, borderColor: c.muted, borderRadius: [4, 4, 0, 0] } },
        { type: 'bar', name: '実際に思い出せた割合', data: cal.map((b) => b.actual), itemStyle: { color: c.accent, borderRadius: [4, 4, 0, 0] } },
      ],
    }),
    [cal],
  )
  const fmtOpt = useCallback(
    (c: ReturnType<typeof chartColors>) => {
      const names = ['もう一度', '難しい', '正解', '簡単']
      const colors = [c.danger, c.warn, c.success, c.accent]
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, textStyle: { color: c.muted, fontSize: 10 } },
        grid: { left: 64, right: 12, top: 8, bottom: 40 },
        xAxis: { type: 'value', max: 1, axisLabel: { color: c.muted, formatter: (v: number) => pct(v) }, splitLine: { lineStyle: { color: c.border } } },
        yAxis: { type: 'category', inverse: true, data: r.formats.map((f) => `${f.label} ${f.total}`), axisLabel: { color: c.fg, fontSize: 11 } },
        series: names.map((name, i) => ({
          type: 'bar',
          name,
          stack: 'all',
          itemStyle: { color: colors[i] },
          data: r.formats.map((f) => (f.total ? f.counts[i] / f.total : 0)),
        })),
      }
    },
    [r.formats],
  )
  const total = r.spacing.reduce((n, s) => n + s.total, 0)
  if (!total) return <p className="text-sm text-muted">回答すると表示されます。</p>
  const predicted = cal.reduce((s, b) => s + b.predicted * b.n, 0) / Math.max(1, cal.reduce((s, b) => s + b.n, 0))
  const actual = cal.reduce((s, b) => s + b.actual * b.n, 0) / Math.max(1, cal.reduce((s, b) => s + b.n, 0))
  const gap = actual - predicted
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-1 text-xs font-medium text-muted">見込みと実際</h3>
        {r.calibrationN < MIN_CAL ? (
          <p className="text-sm text-muted">
            回答する直前の「思い出せる見込み」と、実際に思い出せたか（「難しい」以上）を比べます。記録がたまると表示されます（v2.0 から記録、今 {r.calibrationN} / {MIN_CAL} 件）。
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm leading-relaxed">
              {Math.abs(gap) < 0.05
                ? `見込み（平均 ${pct(predicted)}）とほぼ同じくらい思い出せています（${pct(actual)}）。`
                : gap > 0
                  ? `見込み（平均 ${pct(predicted)}）より多く思い出せています（${pct(actual)}）。`
                  : `見込み（平均 ${pct(predicted)}）ほどは思い出せていません（${pct(actual)}）。間違えた語は、例文や語の成り立ちも見直してみましょう。`}
            </p>
            <EChart option={calOpt} height={220} />
            <p className="text-[11px] text-muted">括弧内は回答の数。{MIN_BUCKET} 件未満の帯は出していません。評価は自分でつけたものです。</p>
          </>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-xs font-medium text-muted">同じ日の繰り返しと、別の日の復習</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 text-left font-normal" />
              <th className="py-1 text-right font-normal">回答</th>
              <th className="py-1 text-right font-normal">思い出せた</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {r.spacing.map((s) => (
              <tr key={s.kind}>
                <td className="py-1.5">{s.label}</td>
                <td className="py-1.5 text-right font-mono">{s.total}</td>
                <td className="py-1.5 text-right font-mono">{s.total ? pct(s.recalled / s.total) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          同じ日の繰り返しは思い出しやすいので、記憶が定着しているかは「別の日の復習」の割合が目安です。FSRS-7 は、どちらの回答も時刻どおりに使って次の間隔を決めます。
        </p>
      </section>

      {r.formats.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-medium text-muted">出題形式ごとの評価</h3>
          <EChart option={fmtOpt} height={Math.max(120, r.formats.length * 34 + 60)} />
          <p className="text-[11px] leading-relaxed text-muted">
            形式によって出た語や難しさが違うので、形式どうしの優劣ではありません。自分が答えにくい形式を知る目安にしてください。
          </p>
        </section>
      )}
    </div>
  )
}
