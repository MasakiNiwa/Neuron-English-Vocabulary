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
        <p className="mb-1 text-xs text-muted">苦手な単語（「もう一度」・忘却の回数）</p>
        {data.weak.length ? (
          <button
            type="button"
            className="w-full text-left"
            onClick={() => onDrill({ title: '苦手な単語', keys: data.weak.map((w) => w.key) })}
          >
            <ul className="flex flex-col gap-1">
              {data.weak.slice(0, 8).map((w) => (
                <li key={w.key} className="flex justify-between rounded-lg px-2 py-1 text-sm hover:bg-surface-2">
                  <span className="font-en">{w.key.replace(/_/g, ' ')}</span>
                  <span className="font-mono text-xs text-muted">
                    ×{w.again} / 忘却{w.lapses}
                  </span>
                </li>
              ))}
            </ul>
          </button>
        ) : (
          <p className="text-sm text-muted">まだありません。</p>
        )}
      </div>
    </div>
  )
}
