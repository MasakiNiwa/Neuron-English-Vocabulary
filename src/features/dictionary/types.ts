/** 単語データのスキーマ（scripts/data/04_build.py の出力と対応） */

export type PosCode = 'noun' | 'verb' | 'adj' | 'adv' | 'prep' | 'conj' | 'pron' | 'det' | 'intj' | 'num' | 'phrase' | string

/** index.json の1行: [key, type(0=単語,1=熟語), rank, 短い訳, 品詞[], shard, 形態素ID[], 解説あり(1/0)] */
export type IndexRow = [string, 0 | 1, number, string, PosCode[], string, string[], (0 | 1)?, number?, (0 | 1)?]

export interface IndexEntry {
  key: string
  type: 'w' | 'p'
  rank: number
  gloss: string
  pos: PosCode[]
  shard: string
  morphs: string[]
  /** 書き下ろし解説がある */
  hasNote: boolean
  /** TOEIC のレベルの目安（470 / 600 / 730 / 860 / 990 点。単語のみ） */
  toeic?: ToeicLevel
  /** TOEIC で特に多い語（TOEIC Service List に含まれる） */
  tsl?: boolean
}

export type ToeicLevel = 470 | 600 | 730 | 860 | 990

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
  /** Tatoeba の文ID（オリジナル例文は負の数） */
  id: number
  /** 1 = このアプリのオリジナル例文（Tatoeba に適切な例文がない語に追加） */
  o?: 1
}

export interface Entry {
  k: string
  h: string
  t: 'w' | 'p'
  r: number
  ipa?: string
  /** 語源・品詞によって発音が変わる語の発音一覧（lead: 導く /liːd/・鉛 /lɛd/ など）。先頭が ipa と同じ */
  ipas?: { ipa: string; p?: PosCode[]; ja?: string }[]
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
  /** 印欧祖語の語根ID */
  pie?: string[]
  /** このリポジトリで書き下ろした解説 */
  note?: { ja: string }
  /** 訳語を手動で確認・修正済み */
  manual?: boolean
  /** TOEIC のレベルの目安と、TOEIC で特に多い語か */
  toeic?: { lv: ToeicLevel; tsl?: boolean }
  /** 語源分解を手動で登録した */
  manualParts?: boolean
}

/** pie = 印欧祖語の語根（英語・ラテン語・ギリシャ語の語根のさらに古い祖先） */
export type MorphemeType = 'root' | 'prefix' | 'suffix' | 'pie' | 'particle'

export interface Morpheme {
  id: string
  type: MorphemeType
  label: string
  forms: string[]
  meaning: { ja: string; ko?: string; zh?: string }
  origin: string
  words: string[]
  /** この語源自体の成り立ち（語源の語源分解）: 構成する形態素ID */
  parts?: string[]
  partsNote?: { ja: string }
  /** 語根の物語（もとの意味から各単語の意味への枝分かれ。data/root_stories.tsv） */
  story?: { ja: string }
  /** 補足説明（不変化詞のイメージなど） */
  desc?: { ja: string } | null
  /** この語源を構成要素に含む語源 */
  partOf?: string[]
  /** 祖語ファミリー（印欧祖語の語根ID） */
  family?: string[]
  /** 印欧祖語の場合: そこから生まれた語根 */
  members?: string[]
}

export interface DataMeta {
  version: string
  generatedAt: string
  /** 元データのファイル名・サイズ・SHA-256 と、生成に使ったツールの版（再現・検証用） */
  sources?: { files: { file: string; bytes: number; sha256: string }[]; tools: Record<string, string | null> }
  counts: {
    words: number
    phrases: number
    morphemes: number
    withParts: number
    withExamples: number
    pieRoots?: number
    withPie?: number
    withNote?: number
    manual?: number
    manualParts?: number
  }
  shardSize: number
}
