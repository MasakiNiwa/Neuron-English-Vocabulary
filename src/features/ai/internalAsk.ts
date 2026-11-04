/**
 * アプリ内の導線（単語ページの「語源を物語で」など）から AI チャットを開いたことの目印。
 *
 * URL（#/ai?q=...）だけでは、アプリ内のボタンから来たのか、外部の細工されたリンクから来たのかを区別できない。
 * そこで、アプリ内のボタンを押したときだけメモリに目印を置き、AI 画面ではその目印と URL が一致したときだけ自動送信する。
 * 目印はメモリ上にしかないので、外部のリンクや新しいタブからは作れない（その場合は入力欄への下書きにとどめる）。
 */
let pending: { about?: string; q?: string; at: number } | null = null

export function markInternalAsk(about: string | undefined, q: string | undefined) {
  pending = { about, q, at: Date.now() }
}

/** 一致すれば目印を消費して true（1 回限り。30 秒以上前の目印は無効） */
export function takeInternalAsk(about: string | undefined, q: string | undefined): boolean {
  const p = pending
  pending = null
  return !!p && p.about === about && p.q === q && Date.now() - p.at < 30_000
}
