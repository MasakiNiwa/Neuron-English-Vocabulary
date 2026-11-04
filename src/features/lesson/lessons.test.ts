import { describe, expect, it } from 'vitest'
import type { Dictionary } from '@/features/dictionary/data'
import type { IndexEntry, Morpheme } from '@/features/dictionary/types'
import { lessonChoices, lessonRoots, lessonWords, stars } from './lessons'

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

  it('星の数', () => {
    expect(stars(6, 6)).toBe(3)
    expect(stars(4, 6)).toBe(2)
    expect(stars(3, 6)).toBe(1)
    expect(stars(5, 6)).toBe(2)
    expect(stars(0, 0)).toBe(0)
  })
})
