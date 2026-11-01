import { BarChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts'
import {
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import { useResolvedTheme } from '@/lib/theme'

echarts.use([
  BarChart,
  PieChart,
  LineChart,
  HeatmapChart,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
])

export type EChartsOption = echarts.EChartsCoreOption

/** CSS 変数からグラフの配色を取得（テーマ切替に追従） */
export function chartColors() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return {
    fg: v('--fg'),
    muted: v('--muted'),
    border: v('--border'),
    surface: v('--surface'),
    surface2: v('--surface-2'),
    accent: v('--accent'),
    accentSoft: v('--accent-soft'),
    success: v('--success'),
    warn: v('--warn'),
    danger: v('--danger'),
    root: v('--node-root'),
    series: [v('--accent'), v('--node-root'), v('--success'), v('--warn'), v('--danger')],
  }
}

export function EChart({
  option,
  height = 260,
  onClick,
}: {
  option: (c: ReturnType<typeof chartColors>) => EChartsOption
  height?: number
  onClick?: (p: { name: string; dataIndex: number; seriesIndex?: number; data: unknown }) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
  const clickRef = useRef(onClick)
  clickRef.current = onClick

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    const c = chartColors()
    chart.setOption({
      textStyle: { color: c.fg, fontFamily: 'inherit' },
      tooltip: {
        backgroundColor: c.surface,
        borderColor: c.border,
        textStyle: { color: c.fg },
      },
      ...option(c),
    })
    chart.on('click', (p) => clickRef.current?.(p as never))
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      chart.dispose()
    }
  }, [option, theme])

  return <div ref={ref} style={{ height }} className="w-full" />
}
