import type { SigmaRenderer } from './SigmaGraph'

/**
 * いま表示しているつながりの図を PNG で保存する（@sigma/export-image）。
 * 共有の仕組みがある端末（スマホ）では共有シートを開き、ないときはファイルとしてダウンロードする。
 * 絞り込み・薄くした状態も画像に写るよう、一時的な描画に点・線の状態を写してから描く
 */
export async function saveGraphImage(renderer: SigmaRenderer, name: string) {
  const { toFile, downloadAsPNG } = await import('@sigma/export-image')
  const graph = renderer.getGraph()
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#ffffff'
  const fileName = `neuron-${name.replace(/[^\w-]+/g, '_') || 'network'}`
  const copyState = (tmp: SigmaRenderer) => {
    graph.forEachNode((n) => {
      const s = renderer.getNodeState(n)
      if (s) tmp.setNodesState([n], s)
    })
    graph.forEachEdge((e) => {
      const s = renderer.getEdgeState(e)
      if (s) tmp.setEdgesState([e], s)
    })
    tmp.setGraphState(renderer.getGraphState())
    tmp.refresh({ skipIndexation: true })
  }
  const opts = {
    fileName,
    backgroundColor: bg,
    withTempRenderer: (tmp: unknown) => copyState(tmp as SigmaRenderer),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = renderer as any
  const file: File = await toFile(r, { ...opts, format: 'png' })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (nav.canShare?.({ files: [file] }) && 'share' in nav) {
    try {
      await nav.share({ files: [file], title: 'ニューロン英単語のつながり' })
      return
    } catch (e) {
      // 共有をやめたときはそのまま終わる（ダウンロードに切り替えない）
      if ((e as Error).name === 'AbortError') return
    }
  }
  await downloadAsPNG(r, opts)
}
