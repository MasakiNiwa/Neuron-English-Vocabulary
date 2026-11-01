import { useCallback } from 'react'
import { EChart, type chartColors } from '../EChart'
import type { ModuleProps } from './types'

/** 学習カレンダー（日別の閲覧数＋回答数）。日付クリックでその日の単語へドリルダウン */
export function ActivityModule({ data, onDrill }: ModuleProps) {
  const end = new Date()
  const start = new Date(end.getTime() - 180 * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const option = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { formatter: (p: { value: [string, number] }) => `${p.value[0]}<br/>活動 ${p.value[1]}` },
      visualMap: {
        show: false,
        min: 0,
        max: Math.max(5, ...data.days.map((d) => d.views + d.reviews)),
        inRange: { color: [c.surface2, c.accent] },
      },
      calendar: {
        range: [fmt(start), fmt(end)],
        cellSize: ['auto', 13],
        top: 24,
        left: 30,
        right: 8,
        itemStyle: { color: c.surface, borderColor: c.border, borderWidth: 1 },
        splitLine: { show: false },
        dayLabel: { color: c.muted, nameMap: 'ZH', fontSize: 9 },
        monthLabel: { color: c.muted, nameMap: 'ZH', fontSize: 10 },
        yearLabel: { show: false },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: data.days.map((d) => [d.date, d.views + d.reviews]),
        },
      ],
    }),
    [data],
  )
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <EChart
          option={option}
          height={150}
          onClick={(p) => {
            const date = (p.data as [string, number])[0]
            const dk = data.dayKeys[date]
            if (dk) onDrill({ title: `${date} に触れた単語`, keys: [...new Set([...dk.viewed, ...dk.reviewed])] })
          }}
        />
      </div>
    </div>
  )
}
