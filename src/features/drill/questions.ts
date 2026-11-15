import type { Dictionary } from '@/features/dictionary/data'
import type { IndexEntry, Morpheme } from '@/features/dictionary/types'

/**
 * 語源ドリルの問題を作る（画面・DB に依存しない）。
 *
 * - e2m: 語源 → 意味
 * - m2e: 意味 → 語源
 * - word: 単語に入っている語源
 * - similar: 似た意味の語源の見分け（「見る」の spec・vid・scope など）
 * - family: 同じ祖先（印欧祖語）から生まれた語源
 */

export type QuestionKind = 'e2m' | 'm2e' | 'word' | 'similar' | 'family'

export const KIND_LABEL: Record<QuestionKind, string> = {
  e2m: '語源 → 意味',
  m2e: '意味 → 語源',
  word: '単語の中の語源',
  similar: '似た意味の見分け',
  family: '同じ祖先の語源',
}

export interface DrillChoice {
  text: string
  /** 語源の選択肢のとき、その語源（解説で意味を見せる） */
  morph?: string
  correct: boolean
}

export interface Question {
  kind: QuestionKind
  /** 学ぶ対象の語源（復習の記録はこの語源につける） */
  target: string
  /** 問題文 */
  prompt: string
  /** 大きく出す見出し（語源・単語・意味） */
  head: string
  headEn: boolean
  /** 見出しの下の補足 */
  sub?: string
  /** 単語の問題のときの単語 */
  word?: string
  choices: DrillChoice[]
  /** 似た意味の問題で比べる語源 */
  compare?: string[]
  /** 同じ祖先の問題での祖先（答えたあとに見せる） */
  ancestor?: string
  /** 似た意味の問題で、候補に共通する意味（答えたあとに見せる） */
  token?: string
}

/** ドリルにする語源の種類 */
const DRILL_TYPES = new Set(['root', 'prefix', 'suffix'])
/** ドリルにできる語源の条件（単語が 3 語以上） */
const MIN_WORDS = 3

/** 意味の言葉（「作る・する」→ 作る, する） */
export function meaningTokens(m: Morpheme): string[] {
  return m.meaning.ja
    .split(/[・、/／（）()]/)
    .map((t) => t.replace(/^〜/, '').trim())
    .filter(Boolean)
}

/** 語源の単語（単語のみ・よく使う順） */
export function morphWords(dict: Dictionary, m: Morpheme): IndexEntry[] {
  return m.words
    .map((k) => dict.byKey.get(k))
    .filter((e): e is IndexEntry => !!e && e.type === 'w' && !dict.hidden.has(e.key))
    .sort((a, b) => a.rank - b.rank)
}

export interface DrillData {
  /** ドリルにできる語源（よく使う単語を含む順） */
  pool: Morpheme[]
  /** 意味の言葉 → それを意味に持つドリルの語源（似た意味の見分けに使う） */
  byToken: Map<string, string[]>
  /** 単語 → その単語に入っている語源 */
  morphsOf: Map<string, Set<string>>
}

const cache = new WeakMap<Dictionary, DrillData>()

export function drillData(dict: Dictionary): DrillData {
  const hit = cache.get(dict)
  if (hit) return hit
  const scored = dict.morphemes
    .filter((m) => DRILL_TYPES.has(m.type) && m.meaning.ja)
    .map((m) => {
      const ws = morphWords(dict, m)
      const top = ws.slice(0, 6)
      return { m, n: ws.length, score: top.length ? top.reduce((s, e) => s + e.rank, 0) / top.length : Infinity }
    })
    .filter((x) => x.n >= MIN_WORDS)
    .sort((a, b) => a.score - b.score || a.m.label.localeCompare(b.m.label))
  // 語根を中心に、接頭辞・接尾辞を少しずつ混ぜる（語根 2 つごとに接頭辞・接尾辞を交互に 1 つ）
  const queue = { root: scored.filter((x) => x.m.type === 'root'), prefix: scored.filter((x) => x.m.type === 'prefix'), suffix: scored.filter((x) => x.m.type === 'suffix') }
  const pattern = ['root', 'root', 'prefix', 'root', 'root', 'suffix'] as const
  const pool: Morpheme[] = []
  for (let k = 0; pool.length < scored.length; k++) {
    const q = queue[pattern[k % pattern.length]]
    const x = q.shift() ?? queue.root.shift() ?? queue.prefix.shift() ?? queue.suffix.shift()
    if (x) pool.push(x.m)
  }
  const byToken = new Map<string, string[]>()
  for (const m of pool) for (const t of meaningTokens(m)) byToken.set(t, [...(byToken.get(t) ?? []), m.id])
  const morphsOf = new Map<string, Set<string>>()
  for (const m of dict.morphemes) for (const w of m.words) (morphsOf.get(w) ?? morphsOf.set(w, new Set()).get(w)!).add(m.id)
  const out = { pool, byToken, morphsOf }
  cache.set(dict, out)
  return out
}

/** 似た意味のドリルの語源（同じ種類で、意味の言葉が重なるもの） */
export function similarMorphs(dict: Dictionary, m: Morpheme): { token: string; ids: string[] }[] {
  const { byToken } = drillData(dict)
  return meaningTokens(m)
    .map((token) => ({ token, ids: (byToken.get(token) ?? []).filter((id) => id !== m.id && dict.morphById.get(id)?.type === m.type) }))
    .filter((g) => g.ids.length > 0)
}

/** 同じ祖先から生まれた、ほかのドリルの語源 */
export function siblings(dict: Dictionary, m: Morpheme): { ancestor: Morpheme; ids: string[] }[] {
  const pool = new Set(drillData(dict).pool.map((x) => x.id))
  return (m.family ?? [])
    .map((id) => dict.morphById.get(id))
    .filter((a): a is Morpheme => !!a)
    .map((ancestor) => ({ ancestor, ids: (ancestor.members ?? []).filter((id) => id !== m.id && pool.has(id)) }))
    .filter((g) => g.ids.length > 0)
}

type Rand = () => number

function shuffle<T>(xs: T[], rand: Rand): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 紛らわしくない（どちらも正解になりえない）語源か */
function distinct(a: Morpheme, b: Morpheme) {
  if (a.id === b.id || a.meaning.ja === b.meaning.ja) return false
  const ta = new Set(meaningTokens(a))
  return !meaningTokens(b).some((t) => ta.has(t))
}

/** ダミーの語源（同じ種類を優先し、よく使う語源から近いものを選ぶ） */
function distractors(dict: Dictionary, m: Morpheme, n: number, rand: Rand, avoid: (x: Morpheme) => boolean = () => false): Morpheme[] {
  const { pool } = drillData(dict)
  const i = pool.findIndex((x) => x.id === m.id)
  // 近い順位の語源から選ぶ（よく知っている語源同士で迷う問題にする）
  const near = pool
    .map((x, k) => ({ x, d: Math.abs(k - i) + rand() * 30 }))
    .filter(({ x }) => distinct(m, x) && !avoid(x))
    .sort((a, b) => (a.x.type === m.type ? 0 : 1) - (b.x.type === m.type ? 0 : 1) || a.d - b.d)
  const out: Morpheme[] = []
  for (const { x } of near) {
    if (out.length >= n) break
    if (out.every((o) => distinct(o, x))) out.push(x)
  }
  return out
}

const typeName = (m: Morpheme) => (m.type === 'prefix' ? '接頭辞' : m.type === 'suffix' ? '接尾辞' : '語根')
const labelOf = (m: Morpheme) => (m.type === 'prefix' ? `${m.label}-` : m.type === 'suffix' ? `-${m.label}` : m.label)
export { labelOf as drillLabel }

function morphChoice(x: Morpheme, correct: boolean): DrillChoice {
  return { text: labelOf(x), morph: x.id, correct }
}

/** 語源 → 意味 */
function e2m(dict: Dictionary, m: Morpheme, rand: Rand): Question | null {
  const ds = distractors(dict, m, 3, rand)
  if (ds.length < 3) return null
  return {
    kind: 'e2m',
    target: m.id,
    prompt: `この${typeName(m)}の意味は？`,
    head: labelOf(m),
    headEn: true,
    // 由来（ラテン語の元の語など）は答えのヒントになるので出さない。いろいろな形だけ
    sub: m.forms.length > 1 ? `形: ${m.forms.slice(0, 5).join(', ')}` : undefined,
    choices: shuffle([{ text: m.meaning.ja, morph: m.id, correct: true }, ...ds.map((x) => ({ text: x.meaning.ja, morph: x.id, correct: false }))], rand),
  }
}

/** 意味 → 語源 */
function m2e(dict: Dictionary, m: Morpheme, rand: Rand): Question | null {
  const ds = distractors(dict, m, 3, rand, (x) => x.label === m.label)
  if (ds.length < 3) return null
  return {
    kind: 'm2e',
    target: m.id,
    prompt: `「${m.meaning.ja}」を表す${typeName(m)}は？`,
    head: m.meaning.ja,
    headEn: false,
    sub: typeName(m),
    choices: shuffle([morphChoice(m, true), ...ds.map((x) => morphChoice(x, false))], rand),
  }
}

/** 単語に入っている語源（その単語に入っていない語源をダミーにする） */
function word(dict: Dictionary, m: Morpheme, rand: Rand, used: ReadonlySet<string>): Question | null {
  const { morphsOf } = drillData(dict)
  const ws = morphWords(dict, m).slice(0, 12)
  const fresh = ws.filter((w) => !used.has(w.key))
  const w = (fresh.length ? fresh : ws)[Math.floor(rand() * Math.min(6, (fresh.length ? fresh : ws).length))]
  if (!w) return null
  const inside = morphsOf.get(w.key) ?? new Set()
  const ds = distractors(dict, m, 3, rand, (x) => inside.has(x.id))
  if (ds.length < 3) return null
  return {
    kind: 'word',
    target: m.id,
    prompt: 'この単語に入っている語源は？',
    head: w.key.replace(/_/g, ' '),
    headEn: true,
    sub: w.gloss.split('、').slice(0, 2).join('、'),
    word: w.key,
    choices: shuffle([morphChoice(m, true), ...ds.map((x) => morphChoice(x, false))], rand),
  }
}

/** 似た意味の見分け: 同じ意味を持つ語源のうち、この単語に入っているのはどれか */
function similar(dict: Dictionary, m: Morpheme, rand: Rand, used: ReadonlySet<string>): Question | null {
  const { morphsOf } = drillData(dict)
  for (const g of shuffle(similarMorphs(dict, m), rand)) {
    const others = g.ids.slice(0, 3)
    // ほかの候補の語源が入っていない単語を選ぶ（どちらも正解にならないように）
    const ws = morphWords(dict, m)
      .slice(0, 12)
      .filter((w) => !others.some((id) => morphsOf.get(w.key)?.has(id)))
    const pick = ws.find((w) => !used.has(w.key)) ?? ws[0]
    if (!pick) continue
    const xs = others.map((id) => dict.morphById.get(id)!).filter(Boolean)
    // 似た意味の語源だけだと意味で絞れてしまうので、意味の違う語源も足して 4 つにする
    const extra = distractors(dict, m, 3 - xs.length, rand, (x) => !!morphsOf.get(pick.key)?.has(x.id) || others.includes(x.id))
    return {
      kind: 'similar',
      target: m.id,
      // 共通の意味は問題文に出さない（答えたあとに見せる）
      prompt: 'この単語に入っている語源は？',
      head: pick.key.replace(/_/g, ' '),
      headEn: true,
      sub: pick.gloss.split('、').slice(0, 2).join('、'),
      word: pick.key,
      choices: shuffle([morphChoice(m, true), ...xs.map((x) => morphChoice(x, false)), ...extra.map((x) => morphChoice(x, false))], rand),
      compare: [m.id, ...others],
      token: g.token,
    }
  }
  return null
}

/** 同じ祖先から生まれた語源 */
function family(dict: Dictionary, m: Morpheme, rand: Rand): Question | null {
  const gs = siblings(dict, m)
  if (!gs.length) return null
  const g = gs[Math.floor(rand() * gs.length)]
  const right = dict.morphById.get(g.ids[Math.floor(rand() * g.ids.length)])!
  const kin = new Set([...(g.ancestor.members ?? [])])
  const ds = distractors(dict, right, 3, rand, (x) => kin.has(x.id) || (x.family ?? []).includes(g.ancestor.id) || x.id === m.id)
  if (ds.length < 3) return null
  return {
    kind: 'family',
    target: m.id,
    prompt: `${labelOf(m)}（${m.meaning.ja}）と同じ祖先から生まれた語源は？`,
    head: labelOf(m),
    headEn: true,
    sub: '祖先は答えたあとに',
    choices: shuffle([morphChoice(right, true), ...ds.map((x) => morphChoice(x, false))], rand),
    ancestor: g.ancestor.id,
  }
}

/** この語源で作れる問題の種類 */
export function kindsFor(dict: Dictionary, m: Morpheme): QuestionKind[] {
  const out: QuestionKind[] = ['e2m', 'm2e', 'word']
  if (similarMorphs(dict, m).length) out.push('similar')
  if (siblings(dict, m).length) out.push('family')
  return out
}

export function makeQuestion(dict: Dictionary, m: Morpheme, kind: QuestionKind, rand: Rand = Math.random, usedWords: ReadonlySet<string> = new Set()): Question | null {
  switch (kind) {
    case 'e2m':
      return e2m(dict, m, rand)
    case 'm2e':
      return m2e(dict, m, rand)
    case 'word':
      return word(dict, m, rand, usedWords)
    case 'similar':
      return similar(dict, m, rand, usedWords)
    case 'family':
      return family(dict, m, rand)
  }
}

export type DrillItemRole = 'random' | 'review' | 'practice' | 'retry'

export interface DrillItem {
  q: Question
  role: DrillItemRole
}

const KINDS: QuestionKind[] = ['e2m', 'm2e', 'word', 'similar', 'family']

/**
 * すべての語源からランダムに n 問。種類を先に均等に選び、その種類を作れる語源から選ぶ
 * （似た意味・同じ祖先の問題も同じくらい出るように）。同じ語源は 1 回に 1 問まで
 */
export function buildRandom(dict: Dictionary, n: number, rand: Rand = Math.random, only?: ReadonlySet<string>): DrillItem[] {
  const pool = drillData(dict).pool.filter((m) => !only || only.has(m.id))
  const items: DrillItem[] = []
  const usedM = new Set<string>()
  const usedW = new Set<string>()
  for (let tries = 0; items.length < n && tries < n * 30; tries++) {
    const kind = KINDS[Math.floor(rand() * KINDS.length)]
    const m = pool[Math.floor(rand() * pool.length)]
    if (!m || usedM.has(m.id)) continue
    const q = makeQuestion(dict, m, kind, rand, usedW)
    if (!q) continue
    usedM.add(m.id)
    if (q.word) usedW.add(q.word)
    items.push({ q, role: 'random' })
  }
  return items
}

/**
 * 復習（期限の来た語源を 1 問ずつ。前回と違う種類を優先し、似た意味・同じ祖先の問題を選ばれやすく）、
 * または練習（1 つの語源を、作れる種類すべてで）
 */
export function buildDrill(dict: Dictionary, plan: { review?: string[]; practice?: string }, rand: Rand = Math.random, lastKind: ReadonlyMap<string, string> = new Map()): DrillItem[] {
  const items: DrillItem[] = []
  const used = new Set<string>()
  const push = (q: Question | null, role: DrillItemRole) => {
    if (!q) return false
    if (q.word) used.add(q.word)
    items.push({ q, role })
    return true
  }
  if (plan.practice) {
    const m = dict.morphById.get(plan.practice)
    if (m) shuffle(kindsFor(dict, m), rand).forEach((k) => push(makeQuestion(dict, m, k, rand, used), 'practice'))
    return items
  }
  for (const id of plan.review ?? []) {
    const m = dict.morphById.get(id)
    if (!m) continue
    const kinds = kindsFor(dict, m).filter((k) => k !== lastKind.get(id))
    const weighted = kinds.flatMap((k) => (k === 'similar' || k === 'family' ? [k, k] : [k]))
    for (const k of shuffle(weighted, rand)) if (push(makeQuestion(dict, m, k, rand, used), 'review')) break
  }
  return shuffle(items, rand)
}

/** 間違えた語源をもう一度（違う種類の問題で） */
export function retryItem(dict: Dictionary, q: Question, rand: Rand = Math.random): DrillItem | null {
  const m = dict.morphById.get(q.target)
  if (!m) return null
  const kinds = shuffle(
    kindsFor(dict, m).filter((k) => k !== q.kind),
    rand,
  )
  for (const k of kinds) {
    const r = makeQuestion(dict, m, k, rand)
    if (r) return { q: r, role: 'retry' }
  }
  return null
}

// ---------------------------------------------------------------- ヒントとメモの答え合わせ

export interface Hint {
  label: string
  text: string
}

const firstLetters = (label: string) => `${label[0]} ${'_ '.repeat(Math.max(0, label.length - 1)).trim()}（${label.length} 文字）`

/** 押したときだけ 1 段ずつ出すヒント（答えに近いものほどあと） */
export function drillHints(dict: Dictionary, q: Question): Hint[] {
  const m = dict.morphById.get(q.target)
  if (!m) return []
  const right = dict.morphById.get(q.choices.find((c) => c.correct)?.morph ?? '') ?? m
  // 語源と同じ綴りの単語（part・port など）は答えそのものになるので、ヒントの単語にしない
  const spell = new Set([m.label, ...m.forms].map(normLabel))
  const ws = morphWords(dict, m).filter((w) => w.key !== q.word && !spell.has(normLabel(w.key)))
  const lang = m.origin.split(/\s/)[0]
  switch (q.kind) {
    case 'e2m':
      return [
        { label: 'この語源を含む単語', text: ws.slice(0, 3).map((w) => headword(w.key)).join(', ') },
        { label: '由来', text: m.origin },
        { label: '意味の最初の文字', text: `${[...m.meaning.ja][0]}…` },
      ]
    case 'm2e':
      return [
        { label: '種類と由来', text: `${typeName(m)}・${lang}から` },
        { label: 'この語源を含む単語の意味', text: ws.slice(0, 3).map((w) => w.gloss.split('、')[0]).join('・') },
        { label: '最初の文字', text: firstLetters(m.label) },
      ]
    case 'word':
    case 'similar':
      return [
        { label: '同じ語源を含むほかの単語', text: ws.slice(0, 2).map((w) => `${headword(w.key)}（${w.gloss.split('、')[0]}）`).join('、') },
        { label: '語源の意味', text: `「${m.meaning.ja}」を表す${typeName(m)}` },
        { label: '最初の文字', text: firstLetters(m.label) },
      ]
    case 'family': {
      const a = q.ancestor ? dict.morphById.get(q.ancestor) : null
      return [
        ...(a ? [{ label: '共通の祖先', text: `印欧祖語 ${a.label}（${a.meaning.ja}）` }] : []),
        { label: '答えの一つの意味', text: `「${right.meaning.ja}」を表す${typeName(right)}` },
        { label: 'その最初の文字', text: firstLetters(right.label) },
      ]
    }
  }
}

const headword = (k: string) => k.replace(/_/g, ' ')

/** 語源の綴りとしての比較用（大文字・ハイフン・* ・空白を除く） */
const normLabel = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[-*\s‐ー]/g, '')

/** メモが指している語源（ラベル・いろいろな形のどれかと一致） */
function morphsNamed(dict: Dictionary, memo: string, candidates: Iterable<string>): string[] {
  const parts = memo.split(/[、,，・/／\s]+/).map(normLabel).filter(Boolean)
  if (!parts.length) return []
  const out: string[] = []
  for (const id of candidates) {
    const m = dict.morphById.get(id)
    if (m && [m.label, ...m.forms].map(normLabel).some((f) => f && parts.includes(f))) out.push(id)
  }
  return out
}

export type MemoVerdict =
  /** 想定した答えと合っている */
  | { kind: 'right'; note?: string }
  /** 想定とは違うが、条件には合う別の語源（同じ意味の別の語源・その単語に入っている別の語源） */
  | { kind: 'other'; note: string }
  | { kind: 'wrong' }

/**
 * メモの答え合わせ。意味を答える問題は辞書の意味と、語源を答える問題は綴り（いろいろな形を含む）と照らす。
 * メモが空なら null（評価は自分で選ぶ）
 */
export function checkMemo(dict: Dictionary, q: Question, memo: string): MemoVerdict | null {
  if (!memo.trim()) return null
  const m = dict.morphById.get(q.target)
  if (!m) return null
  if (q.kind === 'e2m') {
    const toks = meaningTokens(m)
    const parts = memo.split(/[、,，・/／\s]+/).map((p) => p.trim().replace(/^〜/, '')).filter(Boolean)
    const hit = toks.filter((t) => parts.some((p) => p === t || (Math.min(p.length, t.length) >= 2 && (t.includes(p) || p.includes(t)))))
    return hit.length ? { kind: 'right', note: `「${hit.join('・')}」が合っています` } : { kind: 'wrong' }
  }
  const { pool, morphsOf } = drillData(dict)
  const all = dict.morphemes.map((x) => x.id)
  if (q.kind === 'family') {
    const a = q.ancestor ? dict.morphById.get(q.ancestor) : null
    const kin = new Set((a?.members ?? []).filter((id) => id !== m.id))
    const named = morphsNamed(dict, memo, all)
    const hit = named.find((id) => kin.has(id))
    return hit ? { kind: 'right', note: `${labelOf(dict.morphById.get(hit)!)} も同じ祖先です` } : { kind: 'wrong' }
  }
  const named = morphsNamed(dict, memo, all)
  if (named.includes(m.id)) return { kind: 'right' }
  if (q.kind === 'm2e') {
    const toks = new Set(meaningTokens(m))
    const same = named.map((id) => dict.morphById.get(id)!).find((x) => pool.includes(x) && meaningTokens(x).some((t) => toks.has(t)))
    if (same) return { kind: 'other', note: `${labelOf(same)}（${same.meaning.ja}）も近い意味の語源です。ここで想定していた答えは ${labelOf(m)}` }
    return { kind: 'wrong' }
  }
  // 単語の中の語源: その単語に入っている別の語源（接尾辞など）を書いたとき
  const inside = q.word ? morphsOf.get(q.word) : null
  const other = named.find((id) => inside?.has(id))
  if (other) {
    const x = dict.morphById.get(other)!
    return { kind: 'other', note: `${labelOf(x)} もこの単語に入っていますが、ここで聞いていたのは ${labelOf(m)}（${m.meaning.ja}）です` }
  }
  return { kind: 'wrong' }
}

/** この問題の答えを書くメモの案内 */
export function memoPlaceholder(q: Question): string {
  return q.kind === 'e2m' ? '思い浮かんだ意味をメモ（任意）' : '思い浮かんだ語源をメモ（任意・英字で）'
}
