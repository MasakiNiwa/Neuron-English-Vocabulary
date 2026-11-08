import FA2Layout from 'graphology-layout-forceatlas2/worker'
import { useEffect, useRef } from 'react'
import Sigma, { DEFAULT_STYLES } from 'sigma'
import { reduceMotion } from '@/lib/motion'
import { useResolvedTheme } from '@/lib/theme'
import type { EdgeAttrs, NetGraph, NodeAttrs } from './graph'

const FONT = 'Inter, "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif'

/**
 * 点の状態:
 * - isNeighbor: カーソルを合わせた（タップした）点の隣
 * - filteredOut: 絞り込みで隠す
 * - matched: 意味で探したときに当てはまる（光らせる）
 * - selected: 選んでいる点（語根マップで選んだ語根）
 */
type NodeState = { isNeighbor: boolean; filteredOut: boolean; matched: boolean; selected: boolean; dimmed: boolean }

export type SigmaRenderer = Sigma<NodeAttrs, EdgeAttrs, Record<string, unknown>, NodeState, EdgeState, GraphState>
type EdgeState = { filteredOut: boolean }
/** focusing: 点に合わせている / searching: 意味で探している（当てはまらない点を薄くする） */
type GraphState = { focusing: boolean; searching: boolean }

export interface SigmaGraphProps {
  graph: NetGraph
  onNodeClick?: (id: string, attrs: NodeAttrs) => void
  /** 何もない所をタップしたとき */
  onStageClick?: () => void
  liveLayout?: boolean
  labelThreshold?: number
  /** 隠す点（絞り込み） */
  hiddenNodes?: ReadonlySet<string>
  /** 隠す線（絞り込み）。点を隠すと、その点の線も自動で隠れる */
  hiddenEdges?: ReadonlySet<string>
  /** 光らせる点（意味で探す）。null なら探していない */
  matched?: ReadonlySet<string> | null
  /** 選んでいる点。変わるとカメラがその点へ寄る */
  selected?: string | null
  /** 表示したときに、少し引いた所から寄る演出をする（探索用。語根マップは点が多く重く見えるのでしない） */
  intro?: boolean
  /** 薄く描く点（語根めぐりで、まだ訪れていない語根など） */
  dimmed?: ReadonlySet<string> | null
  /** ラベルを重なっても全部出す（道をつなぐ: 点が少なく、どれも読めてほしい） */
  allLabels?: boolean
  /** 表示したときのカメラの引き具合（1 = ちょうど全体。大きいほど引いて余白を取る） */
  fitRatio?: number
  /** 描画の準備ができた・終わったとき（画像の保存に使う） */
  onReady?: (r: SigmaRenderer | null) => void
}

/**
 * Sigma.js v4（WebGL = GPU 描画）でグラフを表示する。
 * 見た目は styles（データと状態から描き方を決める宣言）で指定する。
 * 絞り込み・光らせる・選ぶは、グラフを作り直さず点・線の状態を変えるだけなので、すぐに切り替わる。
 * liveLayout=true の場合、ForceAtlas2 を Web Worker 上で動かしてレイアウトを計算する。
 */
export function SigmaGraph({
  graph,
  onNodeClick,
  onStageClick,
  liveLayout = false,
  labelThreshold = 5,
  hiddenNodes,
  hiddenEdges,
  matched = null,
  selected = null,
  intro = true,
  dimmed = null,
  allLabels = false,
  fitRatio = 1,
  onReady,
}: SigmaGraphProps) {
  const ref = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<SigmaRenderer | null>(null)
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  const clickRef = useRef(onNodeClick)
  clickRef.current = onNodeClick
  const stageRef = useRef(onStageClick)
  stageRef.current = onStageClick
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
    const accent = v('--accent')
    const edgeColor = v('--edge')
    const edgeStrong = v('--edge-strong')
    // 合わせた点と関係のない点・線（薄くする対象）
    const dimNode = (_a: NodeAttrs, s: NodeState & { isHovered: boolean }, g: GraphState) =>
      (g.focusing && !s.isHovered && !s.isNeighbor) || (g.searching && !s.matched && !s.isHovered && !s.selected)
    const offEdge = (_a: EdgeAttrs, s: { isHighlighted: boolean }, g: GraphState) => (g.focusing || g.searching) && !s.isHighlighted

    const renderer = new Sigma<NodeAttrs, EdgeAttrs, Record<string, unknown>, NodeState, EdgeState, GraphState>(graph, el, {
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
      customNodeState: { isNeighbor: false, filteredOut: false, matched: false, selected: false, dimmed: false },
      customEdgeState: { filteredOut: false },
      customGraphState: { focusing: false, searching: false },
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
          ...(allLabels ? [{ labelVisibility: 'visible' as const }] : []),
          // 中心の語はいつもラベルを出し、上に描く
          { when: (a) => !!a.focus, then: { labelVisibility: 'visible', zIndex: 2 } },
          // 合わせた点と関係のない点は薄くし、ラベルを隠す
          { when: dimNode, then: { color: surface2, labelVisibility: 'hidden', zIndex: 0 } },
          // まだ訪れていない語根などは薄く
          { whenState: 'dimmed', then: { color: surface2, labelVisibility: 'hidden' } },
          // 隣の点・探して当てはまった点はラベルを出す
          { whenState: 'isNeighbor', then: { labelVisibility: 'visible', zIndex: 1 } },
          { whenState: 'matched', then: { labelVisibility: 'visible', zIndex: 1 } },
          // 選んでいる点は意味も添えて、いつも見えるように
          {
            whenState: 'selected',
            then: {
              labelVisibility: 'visible',
              zIndex: 3,
              label: (a) => (a.sub ? `${a.label}  ${a.sub}` : a.label),
              backdropVisibility: 'visible',
              backdropBorderColor: accent,
              backdropBorderWidth: 2,
            },
          },
          // 絞り込みで外した点は描かない
          { whenState: 'filteredOut', then: { visibility: 'hidden' } },
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
          { whenState: 'filteredOut', then: { visibility: 'hidden' } },
        ],
      },
    })
    rendererRef.current = renderer
    readyRef.current?.(renderer)

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
    renderer.on('enterNode', ({ node }) => {
      if (renderer.getNodeState(node)?.filteredOut) return
      focus(node)
    })
    renderer.on('leaveNode', () => focus(null))
    renderer.on('clickNode', ({ node }) => {
      if (renderer.getNodeState(node)?.filteredOut) return
      clickRef.current?.(node, graph.getNodeAttributes(node))
    })
    renderer.on('clickStage', () => stageRef.current?.())

    // 新しいグラフに切り替わったときは、少し引いた所から寄って、どこが中心かを分かりやすく
    const cam = renderer.getCamera()
    if (intro && !liveLayout && !reduceMotion()) {
      cam.setState({ ratio: fitRatio * 1.6 })
      void cam.animate({ ratio: fitRatio }, { duration: 450, easing: 'cubicOut' })
    } else if (fitRatio !== 1) cam.setState({ ratio: fitRatio })

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
      readyRef.current?.(null)
      renderer.kill()
      rendererRef.current = null
    }
  }, [graph, liveLayout, labelThreshold, theme, intro, allLabels, fitRatio])

  // 絞り込み（点・線を隠す）
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    const hide = hiddenNodes ?? new Set<string>()
    r.setNodesState(graph.nodes(), { filteredOut: false })
    if (hide.size) r.setNodesState([...hide].filter((n) => graph.hasNode(n)), { filteredOut: true })
    const edgesOut: string[] = []
    graph.forEachEdge((e, _a, s, t) => {
      if (hide.has(s) || hide.has(t) || hiddenEdges?.has(e)) edgesOut.push(e)
    })
    r.setEdgesState(graph.edges(), { filteredOut: false })
    if (edgesOut.length) r.setEdgesState(edgesOut, { filteredOut: true })
    r.refresh({ skipIndexation: true })
  }, [graph, hiddenNodes, hiddenEdges, theme])

  // 意味で探す（当てはまる点を光らせ、その範囲にカメラを合わせる）
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.setNodesState(graph.nodes(), { matched: false })
    const list = matched ? [...matched].filter((n) => graph.hasNode(n)) : []
    if (list.length) r.setNodesState(list, { matched: true })
    r.setGraphState({ searching: !!matched })
    r.refresh({ skipIndexation: true })
    if (list.length) fitTo(r, list)
  }, [graph, matched, theme])

  // 薄く描く点
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.setNodesState(graph.nodes(), { dimmed: false })
    const list = dimmed ? [...dimmed].filter((n) => graph.hasNode(n)) : []
    if (list.length) r.setNodesState(list, { dimmed: true })
    r.refresh({ skipIndexation: true })
  }, [graph, dimmed, theme])

  // 選んでいる点へカメラを寄せる
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.setNodesState(graph.nodes(), { selected: false })
    if (selected && graph.hasNode(selected)) {
      r.setNodesState([selected], { selected: true })
      const d = r.getNodeDisplayData(selected)
      if (d) {
        const cam = r.getCamera()
        void cam.animate({ x: d.x, y: d.y, ratio: Math.min(cam.ratio, 0.35) }, { duration: reduceMotion() ? 0 : 500, easing: 'cubicInOut' })
      }
    }
    r.refresh({ skipIndexation: true })
  }, [graph, selected, theme])

  return <div ref={ref} className="absolute inset-0" />
}

/** いくつかの点が入るようにカメラを動かす */
function fitTo(r: SigmaRenderer, nodes: string[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const d = r.getNodeDisplayData(n)
    if (!d) continue
    minX = Math.min(minX, d.x)
    maxX = Math.max(maxX, d.x)
    minY = Math.min(minY, d.y)
    maxY = Math.max(maxY, d.y)
  }
  if (!Number.isFinite(minX)) return
  const ratio = Math.min(1.1, Math.max(0.15, Math.max(maxX - minX, maxY - minY) * 1.4))
  void r.getCamera().animate({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, ratio }, { duration: reduceMotion() ? 0 : 500, easing: 'cubicInOut' })
}
