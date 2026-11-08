import { describe, expect, it } from 'vitest'
import type { Dictionary } from '@/features/dictionary/data'
import type { Morpheme } from '@/features/dictionary/types'
import { findPath } from './path'

function morph(id: string, type: Morpheme['type'], words: string[]): Morpheme {
  return { id, type, label: id, forms: [id], meaning: { ja: id }, origin: 'ラテン語', words }
}

function makeDict(entries: [string, string[], number][], morphemes: Morpheme[]): Dictionary {
  const es = entries.map(([key, morphs, rank]) => ({ key, type: 'w' as const, rank, gloss: key, pos: [], shard: 'w0', morphs, hasNote: false }))
  return {
    version: 't',
    entries: es,
    byKey: new Map(es.map((e) => [e.key, e])),
    byLower: new Map(es.map((e) => [e.key, e.key])),
    morphemes,
    morphById: new Map(morphemes.map((m) => [m.id, m])),
    hidden: new Set(),
  } as unknown as Dictionary
}

describe('findPath', () => {
  const dict = makeDict(
    [
      ['transport', ['trans', 'port'], 1000],
      ['portable', ['port', 'able'], 2000],
      ['transform', ['trans', 'form'], 1500],
      ['format', ['form', 'ate'], 1800],
      ['nation', ['nat', 'tion'], 500],
      ['action', ['act', 'tion'], 400],
    ],
    [
      morph('trans', 'prefix', ['transport', 'transform']),
      morph('port', 'root', ['transport', 'portable']),
      morph('form', 'root', ['transform', 'format']),
      morph('able', 'suffix', ['portable']),
      morph('ate', 'suffix', ['format']),
      morph('tion', 'suffix', ['nation', 'action']),
      morph('nat', 'root', ['nation']),
      morph('act', 'root', ['action']),
    ],
  )

  it('語根を挟んでつなぐ', () => {
    expect(findPath(dict, 'e:transport', 'e:portable')).toEqual(['e:transport', 'm:port', 'e:portable'])
  })

  it('接頭辞を通ってでもつながれば道を返す', () => {
    expect(findPath(dict, 'e:portable', 'e:format')).toEqual(['e:portable', 'm:port', 'e:transport', 'm:trans', 'e:transform', 'm:form', 'e:format'])
  })

  it('接尾辞（-tion など）だけでつながる語は、つながらないとする', () => {
    expect(findPath(dict, 'e:nation', 'e:action')).toBeNull()
  })

  it('同じ語は自分だけの道', () => {
    expect(findPath(dict, 'e:transport', 'e:transport')).toEqual(['e:transport'])
  })
})
