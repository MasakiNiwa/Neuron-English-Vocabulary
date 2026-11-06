import FA2Layout from 'graphology-layout-forceatlas2/worker'
import { useEffect, useRef } from 'react'
import Sigma, { DEFAULT_STYLES } from 'sigma'
import { useResolvedTheme } from '@/lib/theme'
import type { EdgeAttrs, NetGraph, NodeAttrs } from './graph'

const FONT = 'Inter, "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif'

/** 点にカーソルを合わせた（タップした）ときの状態。合わせた点の隣の点を「隣」として目立たせる */
type NodeState = { isNeighbor: boolean }
type GraphState = { focusing: boolean }

/**
 * Sigma.js v4（WebGL = GPU 描画）でグラフを表示する。
 * 見た目は styles（データと状態から描き方を決める宣言）で指定し、合わせた点とその隣の点・線を状態で目立たせる。
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
    const v = (n: string) => cs.getPropertyValue(n).trim()
    const fg = v('--fg')
    const muted = v('--muted')
    const surface = v('--surface')
    const surface2 = v('--surface-2')
    const edgeColor = v('--edge')
    const edgeStrong = v('--edge-strong')
    // 合わせた点と関係のない点・線（薄くする対象）
    const dimNode = (_a: NodeAttrs, s: NodeState & { isHovered: boolean }, g: GraphState) => g.focusing && !s.isHovered && !s.isNeighbor
    const offEdge = (_a: EdgeAttrs, s: { isHighlighted: boolean }, g: GraphState) => g.focusing && !s.isHighlighted

    const renderer = new Sigma<NodeAttrs, EdgeAttrs, Record<string, unknown>, NodeState, Record<string, never>, GraphState>(graph, el, {
      settings: {
        allowInvalidContainer: true,
        // v3 と同じく、点の大きさを画面上の大きさで決める
        itemSizesReference: 'screen',
        labelRenderedSizeThreshold: labelThreshold,
        labelDensity: 0.8,
        // 線のラベル（何のつながりか）は、合わせた点の線にだけ出す（U06）
        renderEdgeLabels: true,
        minCameraRatio: 0.08,
        maxCameraRatio: 6,
        // スマホで押しやすいよう、点の周りとラベルの文字の上も点として扱う
        nodePickingPadding: 10,
        labelPickingPadding: 6,
        nodeLabelEvents: 'extend',
      },
      customNodeState: { isNeighbor: false },
      customGraphState: { focusing: false },
      styles: {
        nodes: [
          DEFAULT_STYLES.nodes,
          {
            labelFont: FONT,
            labelSize: 13,
            labelColor: fg,
            // 合わせた点のラベルの背景（v3 の defaultDrawNodeHover の代わり）
            backdropColor: surface,
            backdropShadowColor: 'rgba(0,0,0,0.25)',
            backdropShadowBlur: 8,
            backdropPadding: 6,
            backdropCornerRadius: 6,
            // 合わせた点には日本語の意味も添える
            label: (a, s) => (s.isHovered && a.sub ? `${a.label}  ${a.sub}` : a.label),
          },
          // 中心の語はいつもラベルを出し、上に描く
          { when: (a) => !!a.focus, then: { labelVisibility: 'visible', zIndex: 2 } },
          // 合わせた点と関係のない点は薄くし、ラベルを隠す
          { when: dimNode, then: { color: surface2, labelVisibility: 'hidden', zIndex: 0 } },
          // 隣の点はラベルを出す
          { whenState: 'isNeighbor', then: { labelVisibility: 'visible', zIndex: 1 } },
        ],
        edges: [
          DEFAULT_STYLES.edges,
          {
            color: { attribute: 'color', defaultValue: edgeColor },
            labelFont: FONT,
            labelSize: 11,
            labelColor: muted,
            // ふだんは線のラベルを出さない
            labelVisibility: 'hidden',
          },
          // 合わせた点の線だけを残し、太く・濃くしてラベルを出す
          { when: offEdge, then: { visibility: 'hidden' } },
          {
            whenState: 'isHighlighted',
            then: { color: edgeStrong, size: (a) => (a.size ?? 1) + 0.5, labelVisibility: 'visible' },
          },
        ],
      },
    })

    const focus = (node: string | null) => {
      // いったん全部戻してから、合わせた点の隣と線に印を付ける
      renderer.setNodesState(graph.nodes(), { isNeighbor: false })
      renderer.setEdgesState(graph.edges(), { isHighlighted: false })
      if (node) {
        renderer.setNodesState(graph.neighbors(node), { isNeighbor: true })
        renderer.setEdgesState(graph.edges(node), { isHighlighted: true })
      }
      renderer.setGraphState({ focusing: !!node })
      el.style.cursor = node ? 'pointer' : ''
      renderer.refresh({ skipIndexation: true })
    }
    renderer.on('enterNode', ({ node }) => focus(node))
    renderer.on('leaveNode', () => focus(null))
    renderer.on('clickNode', ({ node }) => clickRef.current?.(node, graph.getNodeAttributes(node)))

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
