import type { Dictionary } from '@/features/dictionary/data'
import type { Entry } from '@/features/dictionary/types'

/**
 * 英語を答える問題（日→英・穴埋め・聞いて書く）の、書いた答えの照合とヒント。
 * 照合は評価の「提案」に使うだけで、評価そのものは学習者が押す
 */

/** form: 単語は合っているが、この文で使う形（活用形）が違う（穴埋め） */
export type TypedVerdict = 'correct' | 'form' | 'close' | 'wrong'

/** 大文字・小文字、空白・ハイフン、アポストロフィの違いをそろえる */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[\s\-‐–—_]+/g, ' ')
    .trim()
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

/** 「おしい」とみなす違いの文字数（短い語ほど厳しく） */
export function closeLimit(len: number): number {
  return len <= 4 ? 1 : 2
}

/**
 * 書いた答えを、正解の候補（見出し語・活用形・例文中の形）と比べる。
 * 一番近い候補で判定し、その候補を返す（答え合わせの表示用）
 */
export function checkTyped(input: string, targets: string[], related: string[] = []): { verdict: TypedVerdict; target: string; distance: number } {
  const x = normalizeAnswer(input)
  // 穴埋め: 見出し語やほかの活用形と一致したら「単語は合っているが形が違う」（例文に合う形だけを正解にする。レビュー 2026-11-07 の 06）
  if (x && related.some((r) => normalizeAnswer(r) === x) && !targets.some((t) => normalizeAnswer(t) === x)) {
    return { verdict: 'form', target: targets[0] ?? '', distance: levenshtein(x, normalizeAnswer(targets[0] ?? '')) }
  }
  const cands = [...new Set(targets.filter(Boolean))]
  let best = { target: cands[0] ?? '', distance: Infinity }
  for (const t of cands) {
    const d = levenshtein(x, normalizeAnswer(t))
    if (d < best.distance) best = { target: t, distance: d }
  }
  if (!x) return { verdict: 'wrong', ...best }
  const verdict: TypedVerdict = best.distance === 0 ? 'correct' : best.distance <= closeLimit(normalizeAnswer(best.target).length) ? 'close' : 'wrong'
  return { verdict, ...best }
}

/**
 * 正解の各文字に、書いた答えで合っていたかの印を付ける（おしいときに違う文字を色分けする）。
 * 編集距離の対応づけで、正解側の文字ごとに「一致」か「違う・抜け」かを返す
 */
export function diffMarks(input: string, target: string): { ch: string; ok: boolean }[] {
  const a = normalizeAnswer(input)
  const b = target.toLowerCase()
  const nb = normalizeAnswer(target)
  // 表示は正解の綴りのまま。比較は正規化した文字どうし（長さが同じときだけ位置を対応させる）
  const cmp = nb.length === b.length ? nb : b
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(cmp.length).fill(0)])
  for (let j = 1; j <= cmp.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= cmp.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === cmp[j - 1] ? 0 : 1))
  const ok = Array<boolean>(cmp.length).fill(false)
  let i = a.length
  let j = cmp.length
  while (i > 0 && j > 0) {
    if (a[i - 1] === cmp[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      ok[j - 1] = true
      i--
      j--
    } else if (dp[i][j] === dp[i - 1][j - 1] + 1) {
      i--
      j--
    } else if (dp[i][j] === dp[i][j - 1] + 1) j--
    else i--
  }
  return [...target].map((ch, k) => ({ ch, ok: ch === ' ' || ch === '-' || !!ok[k] }))
}

/** 文字のヒント。first: 頭文字だけ、half: 前半の文字。空白・ハイフンはそのまま見せる */
export function letterHint(word: string, level: 'first' | 'half'): string {
  const letters = [...word].filter((c) => /[a-z]/i.test(c)).length
  const show = level === 'first' ? 1 : Math.max(1, Math.ceil(letters / 2))
  let n = 0
  return [...word]
    .map((c) => {
      if (!/[a-z]/i.test(c)) return c
      n++
      return n <= show ? c : '＿'
    })
    .join('')
}

/**
 * 語の成り立ちのヒント（綴りは見せず、部品の意味だけ）。例: construction →「共に ＋ 築く ＋ （〜すること）」。
 * 部品が 2 つ以上あり、意味の分かる部品が 1 つ以上あるときだけ
 */
export function partsHint(entry: Entry, dict: Dictionary): string | null {
  const parts = entry.parts ?? []
  if (parts.length < 2) return null
  let known = 0
  const out = parts.map((p) => {
    if (p.m?.startsWith('w:')) {
      const g = dict.byKey.get(p.m.slice(2).replace(/ /g, '_'))?.gloss.split('、')[0]
      if (g) {
        known++
        return g
      }
      return '？'
    }
    const m = p.m ? dict.morphById.get(p.m) : null
    if (!m) return '？'
    known++
    const meaning = m.meaning.ja.split('・')[0]
    return m.type === 'suffix' ? `（${meaning}）` : meaning
  })
  return known ? out.join(' ＋ ') : null
}

/** 段階的なヒント（押すたびに 1 段ずつ）。頭文字と文字数 → 部品の意味（あれば）→ 前半の文字 */
export function buildHints(answer: string, entry: Entry, dict: Dictionary): { label: string; text: string }[] {
  const letters = [...answer].filter((c) => /[a-z]/i.test(c)).length
  const hints = [{ label: '頭文字と文字数', text: `${letterHint(answer, 'first')}（${letters} 文字）` }]
  const parts = partsHint(entry, dict)
  if (parts) hints.push({ label: '語の成り立ち', text: parts })
  if (letters >= 3) hints.push({ label: '前半の文字', text: letterHint(answer, 'half') })
  return hints
}
