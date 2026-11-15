import { useCallback } from 'react'
import { EChart, type chartColors } from '../EChart'
import type { ModuleProps } from './types'

/** 記憶の見通し: 今後 7 日の復習予定・今の想起確率の分布・カードの状態 */
export function MemoryModule({ data, onDrill }: ModuleProps) {
  const forecastOpt = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'axis' },
      grid: { left: 32, right: 8, top: 16, bottom: 24 },
      xAxis: { type: 'category', data: data.forecast.map((d) => d.label), axisLabel: { color: c.muted, fontSize: 10 }, axisLine: { lineStyle: { color: c.border } } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.border } } },
      series: [{ type: 'bar', data: data.forecast.map((d, i) => ({ value: d.keys.length, itemStyle: { color: i === 0 ? c.accent : c.root, borderRadius: [4, 4, 0, 0] } })) }],
    }),
    [data],
  )
  const stateOpt = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['45%', '72%'],
          itemStyle: { borderColor: c.surface, borderWidth: 2 },
          label: { color: c.fg, formatter: '{b}\n{c}' },
          data: data.states.map((s, i) => ({ name: s.label, value: s.keys.length, itemStyle: { color: c.series[i] } })),
        },
      ],
    }),
    [data],
  )
  const retOpt = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'axis' },
      grid: { left: 36, right: 8, top: 16, bottom: 28 },
      xAxis: { type: 'category', data: data.retention.map((r) => r.label), axisLabel: { color: c.muted, fontSize: 10 }, axisLine: { lineStyle: { color: c.border } } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.border } } },
      series: [
        {
          type: 'bar',
          data: data.retention.map((r, i) => ({
            value: r.keys.length,
            itemStyle: { color: [c.danger, c.warn, c.accent, c.success, c.success][i], borderRadius: [4, 4, 0, 0] },
          })),
        },
      ],
    }),
    [data],
  )
  if (!data.totals.cards) return <p className="text-sm text-muted">学習カードを追加すると表示されます。</p>
  const learned = data.retention.reduce((n, r) => n + r.keys.length, 0)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <p className="mb-1 text-xs text-muted">今後 7 日の復習予定（今の予定です。回答すると変わります。「今日」には期限を過ぎたカードも含みます）</p>
        <EChart option={forecastOpt} height={180} onClick={(p) => onDrill({ title: `復習予定: ${p.name}`, keys: data.forecast[p.dataIndex].keys })} />
        <p className="sr-only">{data.forecast.map((d) => `${d.label} ${d.keys.length} 枚`).join('、')}</p>
      </div>
      <div className="md:col-span-2">
        <p className="mb-1 text-xs text-muted">スキルのバランス（そのスキルの出題形式で答えた回答だけから出した、今思い出せる見込みの平均。目安です）</p>
        <ul className="flex flex-col gap-1.5">
          {data.skills.map((s) => (
            <li key={s.skill} className="flex items-center gap-2 text-sm">
              <span className="w-8 shrink-0">{s.label}</span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(s.average ?? 0) * 100}%` }} />
              </span>
              <span className="w-10 shrink-0 text-right font-mono text-xs">{s.average === null ? '—' : `${Math.round(s.average * 100)}%`}</span>
              <button
                type="button"
                disabled={!s.tested}
                onClick={() => onDrill({ title: `「${s.label}」の見込みが低い順`, keys: s.lowKeys })}
                className="w-16 shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted hover:text-accent disabled:opacity-40"
                title="このスキルで答えたことのある語（見込みの低い順）"
              >
                {s.tested} 語
              </button>
              <button
                type="button"
                disabled={!s.untestedKeys.length}
                onClick={() => onDrill({ title: `「${s.label}」ではまだ答えていない語`, keys: s.untestedKeys })}
                className="w-20 shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted hover:text-accent disabled:opacity-40"
                title="学習中だが、このスキルの形式ではまだ答えていない語"
              >
                まだ {s.untestedKeys.length}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          読む＝英→日・4択、聞く＝聞いて意味・聞いて書く、書く＝日→英・穴埋め、話す＝発音。ほかの形式での練習の効果は入らないので、あまり答えていないスキルは低めに出ます。学習の「自由に練習 → 見込み低」でスキルを選んで練習できます。
        </p>
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">カードの状態</p>
        <EChart option={stateOpt} height={220} onClick={(p) => onDrill({ title: `状態: ${p.name}`, keys: data.states[p.dataIndex].keys })} />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">今、思い出せる見込み（推定。回答したことのある {learned} 枚。未学習のカードは含めない）</p>
        <EChart
          option={retOpt}
          height={220}
          onClick={(p) => onDrill({ title: `想起確率 ${p.name}`, keys: data.retention[p.dataIndex].keys })}
        />
      </div>
    </div>
  )
}
