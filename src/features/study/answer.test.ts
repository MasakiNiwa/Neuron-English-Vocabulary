import { describe, expect, it } from 'vitest'
import type { Dictionary } from '@/features/dictionary/data'
import type { Entry, Morpheme } from '@/features/dictionary/types'
import { buildHints, checkTyped, diffMarks, letterHint, matchMeanings, normalizeAnswer, partsHint } from './answer'

describe('書いた答えの照合', () => {
  it('大文字・空白・ハイフン・アポストロフィの違いはそろえる', () => {
    expect(normalizeAnswer('  State-of-the-Art ')).toBe('state of the art')
    expect(normalizeAnswer('don’t')).toBe("don't")
  })
  it('一致は正解、1〜2 文字違いはおしい、それ以外は違う', () => {
    expect(checkTyped('Construction', ['construction']).verdict).toBe('correct')
    expect(checkTyped('constrution', ['construction']).verdict).toBe('close')
    expect(checkTyped('building', ['construction']).verdict).toBe('wrong')
    expect(checkTyped('', ['run']).verdict).toBe('wrong')
  })
  it('短い語は 1 文字違いまでをおしいとする', () => {
    expect(checkTyped('rum', ['run']).verdict).toBe('close')
    expect(checkTyped('rim', ['ran']).verdict).toBe('wrong')
  })
  it('活用形など、いちばん近い候補で判定する', () => {
    const r = checkTyped('ran', ['run', 'runs', 'ran', 'running'])
    expect(r).toMatchObject({ verdict: 'correct', target: 'ran' })
  })
  it('違う文字に印を付ける', () => {
    const m = diffMarks('constrution', 'construction')
    expect(m.filter((x) => !x.ok).map((x) => x.ch)).toEqual(['c'])
    expect(diffMarks('give up', 'give up').every((x) => x.ok)).toBe(true)
  })
})

describe('ヒント', () => {
  it('頭文字と前半の文字。空白はそのまま', () => {
    expect(letterHint('give up', 'first')).toBe('g＿＿＿ ＿＿')
    expect(letterHint('construct', 'half')).toBe('const＿＿＿＿')
  })
  const morph = (id: string, ja: string, type: Morpheme['type']) => [id, { id, type, label: id, forms: [], meaning: { ja }, origin: '', words: [] }] as const
  const dict = {
    byKey: new Map([['place', { gloss: '場所、置く' }]]),
    morphById: new Map([morph('pre:com', '共に・完全に', 'prefix'), morph('r:struct', '築く・積む', 'root'), morph('suf:ation', '〜すること・〜の状態', 'suffix'), morph('pre:dis', '離れて', 'prefix')]),
  } as unknown as Dictionary
  const entry = (parts: Entry['parts']) => ({ k: 'x', h: 'x', parts }) as unknown as Entry
  it('部品の意味だけを見せる（綴りは見せない）', () => {
    expect(
      partsHint(
        entry([
          { s: 'con', m: 'pre:com' },
          { s: 'struct', m: 'r:struct' },
          { s: 'ion', m: 'suf:ation' },
        ]),
        dict,
      ),
    ).toBe('共に ＋ 築く ＋ （〜すること）')
    expect(
      partsHint(
        entry([
          { s: 'dis', m: 'pre:dis' },
          { s: 'place', m: 'w:place' },
        ]),
        dict,
      ),
    ).toBe('離れて ＋ 場所')
    expect(partsHint(entry([{ s: 'run', m: null }]), dict)).toBeNull()
  })
  it('段階は 頭文字と文字数 → 語の成り立ち → 前半の文字', () => {
    const h = buildHints('construction', entry([{ s: 'con', m: 'pre:com' }, { s: 'struction', m: null }]), dict)
    expect(h.map((x) => x.label)).toEqual(['頭文字と文字数', '語の成り立ち', '前半の文字'])
    expect(h[0].text).toBe('c＿＿＿＿＿＿＿＿＿＿＿（12 文字）')
  })
})

describe('穴埋めの形（レビュー 2026-11-07 の 06）', () => {
  it('例文に合う形だけを正解にし、別の活用形は「形が違う」とする', () => {
    const forms = ['go', 'goes', 'went', 'gone', 'going']
    expect(checkTyped('going', ['going'], forms).verdict).toBe('correct')
    expect(checkTyped('went', ['going'], forms)).toMatchObject({ verdict: 'form', target: 'going' })
    expect(checkTyped('goin', ['going'], forms).verdict).toBe('close')
    expect(checkTyped('take place', ['taken place'], ['take place', 'took place']).verdict).toBe('form')
  })
})

describe('回答メモと訳語の答え合わせ', () => {
  it('同じ訳語、または 2 文字以上で含むものを合っているとする', () => {
    const ja = ['建設する', '組み立てる', '（理論を）構築する']
    expect(matchMeanings('建設', ja)).toEqual(['建設する'])
    expect(matchMeanings('組み立てる、作る', ja)).toEqual(['組み立てる'])
    expect(matchMeanings('構築する', ja)).toEqual(['（理論を）構築する'])
    expect(matchMeanings('壊す', ja)).toEqual([])
    expect(matchMeanings('', ja)).toEqual([])
    // 1 文字だけでは部分一致にしない
    expect(matchMeanings('建', ja)).toEqual([])
  })
})
