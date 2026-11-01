import { useCallback } from 'react'
import { EChart, type chartColors } from '../EChart'
import type { ModuleProps } from './types'

/** 記憶の状態（FSRS の状態と現在の想起確率の分布） */
export function MemoryModule({ data, onDrill }: ModuleProps) {
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
      yAxis: { type: 'value', axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.border } } },
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
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="mb-1 text-xs text-muted">カードの状態</p>
        <EChart option={stateOpt} height={220} onClick={(p) => onDrill({ title: `状態: ${p.name}`, keys: data.states[p.dataIndex].keys })} />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">現在の想起確率（FSRS 推定）</p>
        <EChart
          option={retOpt}
          height={220}
          onClick={(p) => onDrill({ title: `想起確率 ${p.name}`, keys: data.retention[p.dataIndex].keys })}
        />
      </div>
    </div>
  )
}
