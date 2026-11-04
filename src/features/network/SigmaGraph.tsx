import FA2Layout from 'graphology-layout-forceatlas2/worker'
import { useEffect, useRef } from 'react'
import Sigma from 'sigma'
import { useResolvedTheme } from '@/lib/theme'
import type { NetGraph, NodeAttrs } from './graph'

/**
 * Sigma.js（WebGL = GPU 描画）でグラフを表示する。
 * liveLayout=true の場合、ForceAtlas2 を Web Worker 上で動かしてレイアウトを計算する。
 */
export function SigmaGraph({
  graph,
  onNodeClick,
  liveLayout = false,
  labelThreshold = 5,
}: {
  graph: NetGraph
  onNodeClick?: (id: string, attrs: NodeAttrs) => void
  liveLayout?: boolean
  labelThreshold?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const clickRef = useRef(onNodeClick)
  clickRef.current = onNodeClick
  const theme = useResolvedTheme()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const cs = getComputedStyle(document.documentElement)
    const fg = cs.getPropertyValue('--fg').trim()
    const muted = cs.getPropertyValue('--muted').trim()
    const surface = cs.getPropertyValue('--surface').trim()
    let hovered: string | null = null
    let neighbors = new Set<string>()

    const renderer = new Sigma(graph, el, {
      allowInvalidContainer: true,
      labelFont: 'Inter, "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif',
      labelSize: 13,
      labelWeight: '500',
      labelColor: { color: fg },
      labelRenderedSizeThreshold: labelThreshold,
      labelDensity: 0.8,
      zIndex: true,
      defaultEdgeColor: cs.getPropertyValue('--edge').trim(),
      // 線のラベル（何のつながりか）は、点にカーソルを合わせたときだけその点の線に出す（U06）
      renderEdgeLabels: true,
      edgeLabelSize: 11,
      edgeLabelColor: { color: muted },
      edgeLabelFont: 'Inter, "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif',
      minCameraRatio: 0.08,
      maxCameraRatio: 6,
      defaultDrawNodeHover: (ctx, data, settings) => {
        // ホバー時のラベル（背景付き + 日本語の意味）
        const size = settings.labelSize
        ctx.font = `600 ${size}px ${settings.labelFont}`
        const sub = (data as unknown as NodeAttrs).sub ?? ''
        const text = data.label ?? ''
        const w1 = ctx.measureText(text).width
        ctx.font = `400 ${size - 2}px ${settings.labelFont}`
        const w2 = ctx.measureText(sub).width
        const w = Math.max(w1, w2) + 12
        const x = data.x + data.size + 4
        const y = data.y - size
        ctx.fillStyle = surface
        ctx.shadowColor = 'rgba(0,0,0,0.25)'
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.roundRect(x - 4, y - 4, w, sub ? size * 2 + 10 : size + 8, 6)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = fg
        ctx.font = `600 ${size}px ${settings.labelFont}`
        ctx.fillText(text, x + 2, y + size - 2)
        if (sub) {
          ctx.fillStyle = muted
          ctx.font = `400 ${size - 2}px ${settings.labelFont}`
          ctx.fillText(sub, x + 2, y + size * 2 + 1)
        }
      },
      nodeReducer: (node, data) => {
        const res = { ...data } as Record<string, unknown>
        if ((data as unknown as NodeAttrs).focus) {
          res.forceLabel = true
          res.zIndex = 2
        }
        if (hovered && node !== hovered && !neighbors.has(node)) {
          res.color = cs.getPropertyValue('--surface-2').trim()
          res.label = ''
          res.zIndex = 0
        } else if (hovered) {
          res.forceLabel = true
          res.zIndex = 1
        }
        return res
      },
      edgeReducer: (edge, data) => {
        if (hovered) {
          const [s, t] = graph.extremities(edge)
          if (s !== hovered && t !== hovered) return { ...data, hidden: true }
          return { ...data, color: cs.getPropertyValue('--edge-strong').trim(), size: (data.size ?? 1) + 0.5, forceLabel: true }
        }
        return { ...data, label: '' }
      },
    })

    renderer.on('enterNode', ({ node }) => {
      hovered = node
      neighbors = new Set(graph.neighbors(node))
      el.style.cursor = 'pointer'
      renderer.refresh({ skipIndexation: true })
    })
    renderer.on('leaveNode', () => {
      hovered = null
      neighbors = new Set()
      el.style.cursor = ''
      renderer.refresh({ skipIndexation: true })
    })
    renderer.on('clickNode', ({ node }) => clickRef.current?.(node, graph.getNodeAttributes(node)))
    // 点の中だけでなく、点の周り・ラベル文字の上をタップしても反応するように判定範囲を広げる
    renderer.on('clickStage', ({ event }) => {
      let best: string | null = null
      let bestD = Infinity
      graph.forEachNode((node, a) => {
        const vp = renderer.graphToViewport({ x: a.x, y: a.y })
        const size = renderer.getNodeDisplayData(node)?.size ?? 5
        const dx = event.x - vp.x
        const dy = event.y - vp.y
        const d = Math.hypot(dx, dy)
        const labelW = (a.label?.length ?? 0) * 7.5
        const onLabel = dx >= 0 && dx <= size + 8 + labelW && Math.abs(dy) <= 11
        if ((d <= size + 16 || onLabel) && d < bestD) {
          best = node
          bestD = d
        }
      })
      if (best) clickRef.current?.(best, graph.getNodeAttributes(best))
    })

    let layout: FA2Layout | null = null
    let timer: number | undefined
    if (liveLayout) {
      layout = new FA2Layout(graph, {
        settings: { gravity: 0.5, scalingRatio: 30, barnesHutOptimize: true, linLogMode: true, slowDown: 10 },
      })
      layout.start()
      timer = window.setTimeout(() => layout?.stop(), 3000)
    }
    return () => {
      window.clearTimeout(timer)
      layout?.kill()
      renderer.kill()
    }
  }, [graph, liveLayout, labelThreshold, theme])

  return <div ref={ref} className="absolute inset-0" />
}
