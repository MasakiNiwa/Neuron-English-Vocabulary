import { useSettings } from '@/stores/settings'

/**
 * 今開いているページの内容を、1 枚の縦長の画像（ロングスクリーンショット）にして保存する。
 * - 撮るのはページ本体（<main>）だけ。ヘッダー・ナビゲーションバーは入れない
 * - 中で別にスクロールしている所（AI チャットの会話など）も全部広げて、隠れている所まで写す。
 *   画面に貼り付いた入力欄などは流れの中に戻し、内容と重ならないようにする。撮り終えたら元に戻す
 * - 形式は設定（既定は WebP）。WebP を書き出せないブラウザ（Safari など）では PNG になる
 * - スマホでは共有シート、PC ではダウンロード
 */

export type ScreenshotFormat = 'webp' | 'png' | 'jpeg'

const MIME: Record<ScreenshotFormat, string> = { webp: 'image/webp', png: 'image/png', jpeg: 'image/jpeg' }
const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }

/** 1 枚の画像の画素数の上限（iPhone の Safari の canvas の上限 約 1,677 万画素より少し小さく） */
const MAX_AREA = 16_000_000
/** 縦横の長さの上限（ブラウザの canvas の上限 32,767 より小さく） */
const MAX_SIDE = 32_000

interface Saved {
  el: HTMLElement
  style: string | null
}

/**
 * 中でスクロールしている所・高さが決まっている所を広げ、貼り付いた要素を流れに戻す（元に戻すための記録を返す）。
 * data-screenshot-keep を付けた所（つながりの図など、画面に合わせて作ってある所）はそのまま写す
 */
function expand(root: HTMLElement): Saved[] {
  const saved: Saved[] = []
  const seen = new Set<HTMLElement>()
  const touch = (el: HTMLElement) => {
    if (seen.has(el)) return
    seen.add(el)
    saved.push({ el, style: el.getAttribute('style') })
  }
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].filter((el) => !el.parentElement?.closest('[data-screenshot-keep]'))
  // 先に読み取りだけをまとめて行う（書き換えながら読むと、何度もレイアウトし直して遅くなる）
  const plan = all.map((el) => {
    const cs = getComputedStyle(el)
    return {
      el,
      clipped: el.scrollHeight > el.clientHeight + 1 && cs.overflowY !== 'visible',
      fixedHeight: el.scrollHeight > el.clientHeight + 1 && cs.display !== 'inline',
      pinned: cs.position === 'sticky' || cs.position === 'fixed',
      hidden: cs.display === 'none' || cs.visibility === 'hidden',
      keep: el.hasAttribute('data-screenshot-keep'),
    }
  })
  /** 広げた所が、親の決まった高さや縦並びの flex の中で縮められないようにする */
  const loosen = (el: HTMLElement) => {
    for (let n: HTMLElement | null = el; n && n !== root.parentElement; n = n.parentElement) {
      touch(n)
      n.style.height = 'auto'
      n.style.maxHeight = 'none'
      const parent = n.parentElement
      if (parent) {
        const ps = getComputedStyle(parent)
        if (ps.display.includes('flex') && ps.flexDirection.startsWith('column')) {
          n.style.flexShrink = '0'
          n.style.flexBasis = 'auto'
        }
      }
    }
  }
  for (const p of plan) {
    if (p.hidden || p.keep) continue
    if (p.clipped || p.fixedHeight) {
      loosen(p.el)
      p.el.style.overflow = 'visible'
    }
    if (p.pinned && p.el !== root) {
      touch(p.el)
      p.el.style.position = 'static'
    }
  }
  return saved
}

/** WebGL で描いた図（つながり）は、そのままでは画像に写らないので、描いた直後の絵を <img> にして上に重ねておく */
const canvasHosts = new Map<HTMLElement, () => void>()

/** 図を描く要素と、すぐに描き直す関数を登録する（解除する関数を返す） */
export function registerCanvasHost(el: HTMLElement, render: () => void): () => void {
  canvasHosts.set(el, render)
  return () => canvasHosts.delete(el)
}

async function freezeCanvases(root: HTMLElement): Promise<() => void> {
  const undo: (() => void)[] = []
  for (const [el, render] of canvasHosts) {
    if (!root.contains(el)) continue
    const canvases = Array.from(el.querySelectorAll('canvas'))
    if (!canvases.length || !el.clientWidth || !el.clientHeight) continue
    try {
      // 描いた直後（同じ処理の中）なら、WebGL の絵も読み取れる
      render()
      const ratio = canvases[0].width / (canvases[0].clientWidth || el.clientWidth)
      const out = document.createElement('canvas')
      out.width = Math.round(el.clientWidth * ratio)
      out.height = Math.round(el.clientHeight * ratio)
      const ctx = out.getContext('2d')!
      for (const c of canvases) if (c.width && c.height) ctx.drawImage(c, 0, 0, out.width, out.height)
      const img = document.createElement('img')
      img.alt = ''
      img.src = out.toDataURL('image/png')
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
      await img.decode().catch(() => {})
      const vis = canvases.map((c) => c.style.visibility)
      canvases.forEach((c) => (c.style.visibility = 'hidden'))
      el.appendChild(img)
      undo.push(() => {
        img.remove()
        canvases.forEach((c, i) => (c.style.visibility = vis[i]))
      })
    } catch {
      /* 写せなくても、ほかの部分は保存する */
    }
  }
  return () => undo.forEach((f) => f())
}

function restore(saved: Saved[]) {
  // 同じ要素を 2 度記録したときは、最初の記録（元の状態）が最後に戻るように逆順で
  for (const s of [...saved].reverse()) {
    if (s.style === null) s.el.removeAttribute('style')
    else s.el.setAttribute('style', s.style)
  }
}

function pageName(): string {
  const hash = location.hash.replace(/^#\/?/, '').split('?')[0]
  const name = decodeURIComponent(hash || 'home').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '')
  return name || 'home'
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** 画像を作る（保存はしない）。テスト・確認用にも使う */
export async function capturePage(format: ScreenshotFormat = useSettings.getState().screenshotFormat): Promise<Blob> {
  const root = document.querySelector<HTMLElement>('main')
  if (!root) throw new Error('page not found')
  const { domToBlob } = await import('modern-screenshot')
  const scrollY = window.scrollY
  const unfreeze = await freezeCanvases(root)
  const saved = expand(root)
  // 下のナビゲーションバーのための余白は要らない
  saved.push({ el: root, style: root.getAttribute('style') })
  root.style.paddingBottom = '16px'
  try {
    // 広げたあとの大きさで撮る
    const width = root.scrollWidth
    const height = root.scrollHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const scale = Math.max(0.5, Math.min(dpr, Math.sqrt(MAX_AREA / (width * height)), MAX_SIDE / height, MAX_SIDE / width))
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#ffffff'
    return await domToBlob(root, {
      type: MIME[format],
      quality: 0.92,
      scale,
      width,
      height,
      backgroundColor: bg,
      // 読み込みに時間のかかる外部の画像などで止まらないように
      timeout: 15000,
    })
  } finally {
    restore(saved)
    unfreeze()
    window.scrollTo({ top: scrollY })
  }
}

/** 今開いているページを画像にして、共有（スマホ）またはダウンロード（PC）する */
export async function savePageScreenshot(): Promise<void> {
  const blob = await capturePage()
  const ext = EXT[blob.type] ?? 'png'
  const file = new File([blob], `neuron-${pageName()}-${stamp()}.${ext}`, { type: blob.type || 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  const touch = window.matchMedia?.('(pointer: coarse)').matches
  if (touch && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'ニューロン英単語' })
      return
    } catch (e) {
      // 共有をやめたときは何もしない（ダウンロードに切り替えない）
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
