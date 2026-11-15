import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rowToEntry, type Dictionary } from '@/features/dictionary/data'
import type { Morpheme } from '@/features/dictionary/types'
import { buildDrill, buildRandom, checkMemo, drillData, drillHints, kindsFor, makeQuestion, meaningTokens, retryItem, similarMorphs, type QuestionKind } from './questions'

/** 実際の辞書データで確かめる（問題の作り方がデータに合っているか） */
function realDict(): Dictionary {
  const index = JSON.parse(readFileSync('public/data/index.json', 'utf8'))
  const morphemes: Morpheme[] = JSON.parse(readFileSync('public/data/morphemes.json', 'utf8'))
  const entries = index.e.map(rowToEntry)
  return {
    version: index.v,
    entries,
    byKey: new Map(entries.map((e: { key: string }) => [e.key, e])),
    byLower: new Map(),
    morphemes,
    morphById: new Map(morphemes.map((m) => [m.id, m])),
    hidden: new Set(),
  } as Dictionary
}

/** 再現できる乱数 */
function lcg(seed = 1) {
  let s = seed
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
}

describe('語源ドリルの問題', () => {
  const dict = realDict()
  const { pool, morphsOf } = drillData(dict)

  it('語根・接頭辞・接尾辞から、単語が 3 語以上ある語源をドリルにする', () => {
    expect(pool.length).toBeGreaterThan(200)
    expect(pool.every((m) => ['root', 'prefix', 'suffix'].includes(m.type))).toBe(true)
    // 語根を中心に、接頭辞・接尾辞を混ぜる
    expect(pool.slice(0, 6).map((m) => m.type)).toEqual(['root', 'root', 'prefix', 'root', 'root', 'suffix'])
    expect(new Set(pool.map((m) => m.id)).size).toBe(pool.length)
  })

  it('どの語源・どの種類の問題も、正解はちょうど 1 つで、選択肢が重ならない', () => {
    const rand = lcg(7)
    let made = 0
    for (const m of pool) {
      for (const kind of kindsFor(dict, m)) {
        const q = makeQuestion(dict, m, kind, rand)
        if (!q) continue
        made++
        expect(q.choices.filter((c) => c.correct)).toHaveLength(1)
        expect(new Set(q.choices.map((c) => c.text)).size).toBe(q.choices.length)
        expect(q.choices.length).toBeGreaterThanOrEqual(kind === 'similar' ? 2 : 4)
      }
    }
    expect(made).toBeGreaterThan(pool.length * 3)
  })

  it('意味の問題のダミーは、正解と意味の言葉が重ならない（どちらも正解になりえない）', () => {
    const rand = lcg(3)
    for (const m of pool.slice(0, 120)) {
      for (const kind of ['e2m', 'm2e'] as QuestionKind[]) {
        const q = makeQuestion(dict, m, kind, rand)!
        const ts = new Set(meaningTokens(m))
        for (const c of q.choices.filter((c) => !c.correct)) {
          const x = dict.morphById.get(c.morph!)!
          expect(meaningTokens(x).some((t) => ts.has(t))).toBe(false)
        }
      }
    }
  })

  it('単語の問題・似た意味の問題: 正解の語源はその単語に入っていて、ほかの選択肢の語源は入っていない', () => {
    const rand = lcg(11)
    for (const m of pool) {
      for (const kind of ['word', 'similar'] as QuestionKind[]) {
        const q = makeQuestion(dict, m, kind, rand)
        if (!q) continue
        const inside = morphsOf.get(q.word!)!
        for (const c of q.choices) expect(inside.has(c.morph!)).toBe(c.correct)
      }
    }
  })

  it('似た意味の問題: 「見る」の spec・vid・scope を見分ける', () => {
    const spec = dict.morphById.get('r:spec')!
    expect(similarMorphs(dict, spec).find((g) => g.token === '見る')?.ids).toEqual(expect.arrayContaining(['r:vid', 'r:scope']))
    const q = makeQuestion(dict, spec, 'similar', lcg(1))!
    expect(q.choices.map((c) => c.morph)).toEqual(expect.arrayContaining(['r:spec', 'r:vid']))
  })

  it('同じ祖先の問題: 正解は同じ印欧祖語から生まれた語源、ダミーはそうでない語源', () => {
    const rand = lcg(5)
    for (const m of pool) {
      const q = makeQuestion(dict, m, 'family', rand)
      if (!q) continue
      const members = new Set(dict.morphById.get(q.ancestor!)!.members)
      for (const c of q.choices) expect(members.has(c.morph!)).toBe(c.correct)
    }
  })

  it('ランダム: すべての語源から、種類を混ぜて n 問（同じ語源は 1 回に 1 問）。範囲を絞ることもできる', () => {
    const items = buildRandom(dict, 30, lcg(4))
    expect(items).toHaveLength(30)
    expect(new Set(items.map((x) => x.q.target)).size).toBe(30)
    expect(new Set(items.map((x) => x.q.kind)).size).toBe(5)
    const only = new Set(['r:fac', 'r:spec', 'r:vid', 'r:port', 'r:sta', 'r:duc', 'pre:re', 'pre:ex'])
    expect(buildRandom(dict, 5, lcg(4), only).every((x) => only.has(x.q.target))).toBe(true)
  })

  it('ヒントを先に出さない: 語源 → 意味に由来を出さず、似た意味・同じ祖先は答えたあとに', () => {
    const fac = dict.morphById.get('r:fac')!
    expect(makeQuestion(dict, fac, 'e2m', lcg(1))!.sub).not.toContain('facere')
    const q = makeQuestion(dict, dict.morphById.get('r:spec')!, 'similar', lcg(1))!
    expect(q.prompt).not.toContain('見る')
    expect(q.choices).toHaveLength(4)
    expect(makeQuestion(dict, fac, 'family', lcg(1))?.sub ?? '').not.toContain('*')
  })

  it('復習は 1 語源 1 問、練習はその語源の問題を全種類。間違えたら違う種類でもう一度', () => {
    const items = buildDrill(dict, { review: ['r:fac', 'r:sta', 'r:vid'] }, lcg(2))
    expect(items.map((x) => x.q.target).sort()).toEqual(['r:fac', 'r:sta', 'r:vid'])
    const p = buildDrill(dict, { practice: 'r:spec' }, lcg(2))
    expect(new Set(p.map((x) => x.q.kind))).toEqual(new Set(kindsFor(dict, dict.morphById.get('r:spec')!)))
    const again = retryItem(dict, items[0].q, lcg(9))!
    expect(again.q.target).toBe(items[0].q.target)
    expect(again.q.kind).not.toBe(items[0].q.kind)
  })

  it('メモの答え合わせ: 意味は辞書の意味の言葉と、語源は綴り（いろいろな形を含む）と照らす', () => {
    const fac = dict.morphById.get('r:fac')!
    const e2m = makeQuestion(dict, fac, 'e2m', lcg(1))!
    expect(checkMemo(dict, e2m, '作る')?.kind).toBe('right')
    expect(checkMemo(dict, e2m, '見る')?.kind).toBe('wrong')
    expect(checkMemo(dict, e2m, '  ')).toBeNull()
    const m2e = makeQuestion(dict, fac, 'm2e', lcg(1))!
    expect(checkMemo(dict, m2e, 'fac')?.kind).toBe('right')
    expect(checkMemo(dict, m2e, 'FECT')?.kind).toBe('right')
    expect(checkMemo(dict, m2e, 'spec')?.kind).toBe('wrong')
    // 「見る」を聞かれて、同じ意味の別の語源を書いたとき
    const see = makeQuestion(dict, dict.morphById.get('r:spec')!, 'm2e', lcg(1))!
    expect(checkMemo(dict, see, 'vid')?.kind).toBe('other')
    // 接頭辞はハイフンがあってもなくても
    const ex = makeQuestion(dict, dict.morphById.get('pre:ex')!, 'm2e', lcg(1))!
    expect(checkMemo(dict, ex, 'ex-')?.kind).toBe('right')
  })

  it('同じ祖先の問題のメモは、選択肢の正解でなくても同じ祖先の語源なら合っている', () => {
    for (const m of pool) {
      const q = makeQuestion(dict, m, 'family', lcg(3))
      if (!q) continue
      const kin = dict.morphById.get(q.ancestor!)!.members!.filter((id) => id !== m.id)
      for (const id of kin) expect(checkMemo(dict, q, dict.morphById.get(id)!.label)?.kind).toBe('right')
      expect(checkMemo(dict, q, m.label)?.kind).toBe('wrong')
      break
    }
  })

  it('ヒントは 3 段まで。最初の段に答えそのものは出さない', () => {
    const rand = lcg(8)
    for (const m of pool.slice(0, 80)) {
      for (const kind of kindsFor(dict, m)) {
        const q = makeQuestion(dict, m, kind, rand)
        if (!q) continue
        const hs = drillHints(dict, q)
        expect(hs.length).toBeGreaterThan(0)
        expect(hs.length).toBeLessThanOrEqual(3)
        const right = q.choices.find((c) => c.correct)!.text
        if (kind !== 'e2m') expect(hs[0].text.split(/[\s,、・（）()]+/)).not.toContain(right.replace(/^-|-$/g, ''))
        else expect(hs[0].text).not.toContain(m.meaning.ja)
      }
    }
  })
})
