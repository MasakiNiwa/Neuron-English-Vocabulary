/** 単語データのスキーマ（scripts/data/04_build.py の出力と対応） */

export type PosCode = 'noun' | 'verb' | 'adj' | 'adv' | 'prep' | 'conj' | 'pron' | 'det' | 'intj' | 'num' | 'phrase' | string

/** index.json の1行: [key, type(0=単語,1=熟語), rank, 短い訳, 品詞[], shard, 形態素ID[]] */
export type IndexRow = [string, 0 | 1, number, string, PosCode[], string, string[]]

export interface IndexEntry {
  key: string
  type: 'w' | 'p'
  rank: number
  gloss: string
  pos: PosCode[]
  shard: string
  morphs: string[]
}

export interface Gloss {
  p: PosCode
  ja: string[]
  ko?: string[]
  zh?: string[]
}

export interface Part {
  /** 綴り */
  s: string
  /** 形態素ID（r:/pre:/suf:）または 'w:<語>'（語基） */
  m: string | null
}

export interface Example {
  en: string
  ja: string
  /** Tatoeba の文ID */
  id: number
}

export interface Entry {
  k: string
  h: string
  t: 'w' | 'p'
  r: number
  ipa?: string
  g: Gloss[]
  d?: { p: PosCode; en: string[] }[]
  parts?: Part[]
  ety?: string
  forms?: string[]
  comp?: string[]
  syn?: string[]
  ant?: string[]
  der?: string[]
  rel?: string[]
  ph?: string[]
  ex?: Example[]
  ngsl?: boolean
  z?: number
  freq?: number
}

export type MorphemeType = 'root' | 'prefix' | 'suffix'

export interface Morpheme {
  id: string
  type: MorphemeType
  label: string
  forms: string[]
  meaning: { ja: string; ko?: string; zh?: string }
  origin: string
  words: string[]
}

export interface DataMeta {
  version: string
  generatedAt: string
  counts: { words: number; phrases: number; morphemes: number; withParts: number; withExamples: number }
  shardSize: number
}
