/**
 * 発音チェックの採点（音声認識の結果とお手本の比較）。
 *
 * 音声認識は「発音の正確さ」を直接は測れないが、「英語として正しく聞き取られたか」は発音が通じたかの良い目安になる。
 * お手本を単語に分け、聞き取った英語と単語単位で並べて比べる（編集距離による整列）。
 * 単語の綴りが少し違うだけ（plural の s 抜けなど）は「おしい」とする。
 */

export type WordStatus = 'ok' | 'close' | 'miss'

export interface WordResult {
  /** お手本の単語（表示用。元の大文字・記号を保つ） */
  word: string
  status: WordStatus
  /** その位置で聞き取った単語（違っていた場合） */
  heard?: string
}

export interface PronounceResult {
  /** 0〜100 */
  score: number
  /** 採点に使った聞き取り結果（候補のうち最も点が高いもの） */
  heard: string
  words: WordResult[]
  /** お手本にない、余分に聞き取った単語の数 */
  extra: number
}

const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am', "you're": 'you are', "he's": 'he is', "she's": 'she is', "it's": 'it is', "we're": 'we are', "they're": 'they are',
  "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have', "i'll": 'i will', "you'll": 'you will',
  "he'll": 'he will', "she'll": 'she will', "we'll": 'we will', "they'll": 'they will', "i'd": 'i would', "you'd": 'you would',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not', "cannot": 'can not', "won't": 'will not',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "haven't": 'have not', "hasn't": 'has not',
  "hadn't": 'had not', "wouldn't": 'would not', "shouldn't": 'should not', "couldn't": 'could not', "let's": 'let us',
  "that's": 'that is', "there's": 'there is', "what's": 'what is', "where's": 'where is', "who's": 'who is',
}

const NUMBERS: Record<string, string> = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
  '10': 'ten', '11': 'eleven', '12': 'twelve', '20': 'twenty', '100': 'hundred',
}

/** 比較用に単語へ分ける（小文字・記号除去・短縮形と数字の展開）。表示用の元の単語も返す */
export function tokenize(text: string): { norm: string; raw: string; idx: number }[] {
  const out: { norm: string; raw: string; idx: number }[] = []
  let idx = 0
  for (const raw of text.replace(/[‘’]/g, "'").split(/\s+/)) {
    const w = raw.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')
    if (!w) continue
    const expanded = CONTRACTIONS[w] ?? NUMBERS[w] ?? w.replace(/'s$/, '').replace(/'/g, '')
    for (const part of expanded.split(' ')) if (part) out.push({ norm: part, raw, idx })
    idx++
  }
  return out
}

/** 文字列の編集距離 */
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/** 単語どうしの近さ（ok: 一致 / close: 綴りの違いが小さい / miss） */
function compareWord(target: string, heard: string): WordStatus {
  if (target === heard) return 'ok'
  const dist = lev(target, heard)
  const len = Math.max(target.length, heard.length)
  if (len >= 4 && dist <= Math.max(1, Math.floor(len / 4))) return 'close'
  return 'miss'
}

/** お手本と聞き取り結果を単語単位で整列して採点する */
export function scoreOne(target: string, heard: string): PronounceResult {
  const t = tokenize(target)
  const h = tokenize(heard)
  const n = t.length
  const m = h.length
  // 整列のコスト: 一致 0、おしい 0.5、違う 1、抜け・余分 1
  const cost = (i: number, j: number) => ({ ok: 0, close: 0.5, miss: 1 })[compareWord(t[i].norm, h[j].norm)]
  const dp = Array.from({ length: n + 1 }, (_, i) => [i, ...Array(m).fill(0)] as number[])
  for (let j = 1; j <= m; j++) dp[0][j] = j
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost(i - 1, j - 1))
  // 逆にたどって、お手本の各単語の結果を決める
  const words: WordResult[] = Array(n)
  let extra = 0
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + cost(i - 1, j - 1)) {
      const st = compareWord(t[i - 1].norm, h[j - 1].norm)
      words[i - 1] = { word: t[i - 1].raw, status: st, heard: st === 'ok' ? undefined : h[j - 1].norm }
      i--
      j--
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      words[i - 1] = { word: t[i - 1].raw, status: 'miss' }
      i--
    } else {
      extra++
      j--
    }
  }
  // 短縮形（don't → do not）などで 1 つの表示単語が複数に展開された場合は、表示単語ごとにまとめる（悪い方を採る）
  const RANK: Record<WordStatus, number> = { ok: 0, close: 1, miss: 2 }
  const merged: WordResult[] = []
  words.forEach((w, k) => {
    const last = merged.at(-1)
    if (last && k > 0 && t[k].idx === t[k - 1].idx) {
      if (RANK[w.status] > RANK[last.status]) last.status = w.status
    } else merged.push({ ...w })
  })
  const got = words.reduce((s, w) => s + (w.status === 'ok' ? 1 : w.status === 'close' ? 0.5 : 0), 0)
  // 余分な単語は少しだけ減点（言い直しなどで多少入るのは許す）
  const score = n ? Math.max(0, Math.round(((got - extra * 0.25) / n) * 100)) : 0
  return { score: Math.min(100, score), heard, words: merged, extra }
}

/**
 * 音声認識の候補（複数）から、最も点の高い結果を採る。
 * 単語 1 語のお手本で、候補の中にその単語が含まれていれば（"the word apple" など）満点にする
 */
export function scoreAttempt(target: string, alternatives: string[]): PronounceResult {
  const alts = alternatives.map((a) => a.trim()).filter(Boolean)
  if (!alts.length) return { score: 0, heard: '', words: tokenize(target).map((t) => ({ word: t.raw, status: 'miss' })), extra: 0 }
  const tt = tokenize(target)
  if (tt.length === 1) {
    const hit = alts.find((a) => tokenize(a).some((h) => h.norm === tt[0].norm))
    if (hit) return { score: 100, heard: hit, words: [{ word: tt[0].raw, status: 'ok' }], extra: 0 }
  }
  return alts.map((a) => scoreOne(target, a)).reduce((best, r) => (r.score > best.score ? r : best))
}

/** 点数の段階（表示と、学習での評価の提案に使う） */
export function grade(score: number): 'perfect' | 'good' | 'close' | 'retry' {
  if (score >= 95) return 'perfect'
  if (score >= 75) return 'good'
  if (score >= 45) return 'close'
  return 'retry'
}
