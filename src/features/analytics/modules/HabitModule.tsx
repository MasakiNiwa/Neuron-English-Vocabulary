import { useCallback } from 'react'
import { EChart, type chartColors } from '../EChart'
import type { ModuleProps } from './types'

/** 時間帯別の学習量 + 苦手な単語 */
export function HabitModule({ data, onDrill }: ModuleProps) {
  const option = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'axis' },
      grid: { left: 32, right: 8, top: 12, bottom: 24 },
      xAxis: { type: 'category', data: data.hours.map((_, i) => `${i}`), axisLabel: { color: c.muted, fontSize: 10 }, axisLine: { lineStyle: { color: c.border } } },
      yAxis: { type: 'value', axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.border } } },
      series: [{ type: 'bar', data: data.hours, itemStyle: { color: c.root, borderRadius: [3, 3, 0, 0] } }],
    }),
    [data],
  )
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="mb-1 text-xs text-muted">時間帯別の活動（時）</p>
        <EChart option={option} height={200} />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">最近 28 日でつまずいた語（そのあと別の日に思い出せた語は除く）</p>
        {data.stumbles[28].length ? (
          <button type="button" className="w-full text-left" onClick={() => onDrill({ title: '最近 28 日でつまずいた語', keys: data.stumbles[28].map((w) => w.key) })}>
            <ul className="flex flex-col gap-1">
              {data.stumbles[28].slice(0, 8).map((w) => (
                <li key={w.key} className="flex justify-between rounded-lg px-2 py-1 text-sm hover:bg-surface-2">
                  <span className="font-en">{w.key.replace(/_/g, ' ')}</span>
                  <span className="font-mono text-xs text-muted">
                    もう一度 {w.again} / 回答 {w.answers}
                  </span>
                </li>
              ))}
            </ul>
          </button>
        ) : (
          <p className="text-sm text-muted">ありません。{data.recovered.length > 0 && `前に間違えた ${data.recovered.length} 語も、別の日に思い出せています。`}</p>
        )}
        {data.weak.length > 0 && (
          <button type="button" onClick={() => onDrill({ title: 'これまでに忘れた回数の多い語', keys: data.weak.map((w) => w.key) })} className="mt-2 text-xs text-accent">
            これまでの累計で見る →
          </button>
        )}
      </div>
    </div>
  )
}
