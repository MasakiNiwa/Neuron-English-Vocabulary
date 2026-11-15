import { describe, expect, it } from 'vitest'
import type { Dictionary } from '@/features/dictionary/data'
import type { IndexEntry, Morpheme } from '@/features/dictionary/types'
import { lessonChoices, lessonRoots, lessonWords, masteredKeys, recalledAfterGap, rootProgress } from './lessons'

const ix = (key: string, rank: number, gloss: string, type: 'w' | 'p' = 'w'): IndexEntry => ({ key, type, rank, gloss, pos: ['verb'], shard: 'w0', morphs: [], hasNote: false })
const root = (id: string, words: string[]): Morpheme => ({ id, type: 'root', label: id.slice(2), forms: [id.slice(2)], meaning: { ja: '見る' }, origin: 'ラテン語', words })

function dict(entries: IndexEntry[], morphemes: Morpheme[]): Dictionary {
  return {
    version: 'x',
    entries,
    byKey: new Map(entries.map((e) => [e.key, e])),
    byLower: new Map(),
    morphemes,
    morphById: new Map(morphemes.map((m) => [m.id, m])),
    hidden: new Set(),
  }
}

describe('語根レッスン', () => {
  const es = [
    ix('inspect', 900, '調べる、検査する'),
    ix('respect', 300, '尊敬する'),
    ix('expect', 200, '期待する、予期する'),
    ix('spectator', 4000, '観客'),
    ix('prospect', 2500, '見込み'),
    ix('suspect', 1500, '疑う'),
    ix('aspect', 1200, '面、局面'),
    ix('look_at', 50, '見る', 'p'),
    ix('run', 100, '走る'),
    ix('rare', 5000, '珍しい'),
  ]
  const spec = root('r:spec', ['inspect', 'respect', 'expect', 'spectator', 'prospect', 'suspect', 'aspect', 'look_at'])
  const small = root('r:tiny', ['run', 'rare'])
  const d = dict(es, [spec, small])

  it('単語が 5 語以上ある語根だけを、よく使う単語を含む順に並べる', () => {
    expect(lessonRoots(d).map((m) => m.id)).toEqual(['r:spec'])
  })

  it('出題は単語だけ・よく使う順に 6 語', () => {
    expect(lessonWords(d, spec).map((e) => e.key)).toEqual(['expect', 'respect', 'inspect', 'aspect', 'suspect', 'prospect'])
  })

  it('4 択: 正解は 1 つ、同じ訳を含む候補や重複はない', () => {
    const words = lessonWords(d, spec)
    for (let i = 0; i < 20; i++) {
      const c = lessonChoices(words[0], null, words, es)
      expect(c.filter((x) => x.correct)).toHaveLength(1)
      expect(new Set(c.map((x) => x.text)).size).toBe(c.length)
      expect(c.length).toBeLessThanOrEqual(4)
    }
  })

  it('レッスンを重ねると、まだ正解していない語から出す', () => {
    const first = lessonWords(d, spec).map((e) => e.key)
    const next = lessonWords(d, spec, new Set(['expect', 'respect', 'inspect'])).map((e) => e.key)
    expect(next.slice(0, 4)).toEqual(['aspect', 'suspect', 'prospect', 'spectator'])
    expect(next).toHaveLength(6)
    expect(first).not.toEqual(next)
  })

  it('図鑑の段階: 1 回終えただけでは ★1。全部正解で ★2、半分以上を日をあけて思い出せたら ★3', () => {
    const all = ['expect', 'respect', 'inspect', 'aspect', 'suspect', 'prospect', 'spectator']
    const rec = (keys: string[]) => ({ id: 'r:spec', completedAt: 1, correct: 6, total: 6, best: 6, plays: 1, correctKeys: keys })
    expect(rootProgress(d, spec, null, new Set()).stage).toBe(0)
    expect(rootProgress(d, spec, rec(all.slice(0, 6)), new Set()).stage).toBe(1)
    expect(rootProgress(d, spec, rec(all), new Set(['expect', 'respect', 'inspect'])).stage).toBe(2)
    expect(rootProgress(d, spec, rec(all), new Set(['expect', 'respect', 'inspect', 'aspect']))).toMatchObject({ stage: 3, target: 7, recallNeed: 4 })
  })

  it('v2.6 までの記録: 満点ならそのとき出した語を正解済みとみなす', () => {
    expect(masteredKeys(d, spec, { id: 'r:spec', completedAt: 1, correct: 6, total: 6, best: 6, plays: 1 }).size).toBe(6)
    expect(masteredKeys(d, spec, { id: 'r:spec', completedAt: 1, correct: 4, total: 6, best: 5, plays: 2 }).size).toBe(0)
  })

  it('日をあけて思い出せた語', () => {
    const D = 86400000
    const t0 = new Date('2026-11-01T10:00:00').getTime()
    const s = recalledAfterGap([
      { entryId: 'a', rating: 3, reviewedAt: t0 },
      { entryId: 'a', rating: 3, reviewedAt: t0 + 2 * D },
      { entryId: 'b', rating: 3, reviewedAt: t0 },
      { entryId: 'b', rating: 3, reviewedAt: t0 + 600000 },
      { entryId: 'c', rating: 3, reviewedAt: t0 },
      { entryId: 'c', rating: 1, reviewedAt: t0 + 3 * D },
    ])
    expect([...s]).toEqual(['a'])
  })
})
