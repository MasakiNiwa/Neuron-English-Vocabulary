import { useCallback } from 'react'
import { EChart, type chartColors } from '../EChart'
import type { ModuleProps } from './types'

/** 頻度帯ごとのカバー率。棒クリックで未学習の単語へドリルダウン */
export function CoverageModule({ data, onDrill }: ModuleProps) {
  const b = data.rankBuckets
  const option = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { textStyle: { color: c.muted }, top: 0, itemWidth: 10, itemHeight: 10 },
      grid: { left: 70, right: 16, top: 28, bottom: 20 },
      xAxis: { type: 'value', max: 100, axisLabel: { color: c.muted, formatter: '{value}%' }, splitLine: { lineStyle: { color: c.border } } },
      yAxis: { type: 'category', inverse: true, data: b.map((x) => x.label), axisLabel: { color: c.muted, fontSize: 10 }, axisLine: { lineStyle: { color: c.border } } },
      series: [
        {
          name: '閲覧',
          type: 'bar',
          data: b.map((x) => +((x.viewed / Math.max(1, x.total)) * 100).toFixed(1)),
          itemStyle: { color: c.accent, borderRadius: [0, 4, 4, 0] },
        },
        {
          name: '学習中',
          type: 'bar',
          data: b.map((x) => +((x.studied / Math.max(1, x.total)) * 100).toFixed(1)),
          itemStyle: { color: c.success, borderRadius: [0, 4, 4, 0] },
        },
      ],
    }),
    [b],
  )
  return (
    <EChart
      option={option}
      height={Math.max(240, b.length * 30)}
      onClick={(p) => {
        const x = b[p.dataIndex]
        onDrill({ title: `${x.label}: まだ触れていない単語（${x.unseen.length}）`, keys: x.unseen })
      }}
    />
  )
}
