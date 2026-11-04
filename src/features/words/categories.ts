import type { IndexEntry } from '@/features/dictionary/types'

/**
 * 単語ページの入口の分類。URL の ?c=<id> で一覧を開く。
 * 判定は索引（IndexEntry）だけで行い、詳細データを読まずに数えられるようにする
 */
export interface Category {
  id: string
  /** 入口のタイルに出す名前 */
  title: string
  /** 補足（範囲など） */
  hint: string
  match: (e: IndexEntry) => boolean
}

const range = (lo: number, hi: number) => (e: IndexEntry) => e.type === 'w' && e.rank >= lo && e.rank <= hi

export const LEVEL_CATEGORIES: Category[] = [
  { id: 'lv1', title: '基本の基本', hint: '頻度 1〜499 位', match: range(1, 499) },
  { id: 'lv2', title: '中学〜高校基礎', hint: '500〜999 位', match: range(500, 999) },
  { id: 'lv3', title: '高校レベル', hint: '1000〜1999 位', match: range(1000, 1999) },
  { id: 'lv4', title: '大学入試レベル', hint: '2000〜2999 位', match: range(2000, 2999) },
  { id: 'lv5', title: '上級', hint: '3000〜4999 位', match: range(3000, 4999) },
  { id: 'lv6', title: '難関', hint: '5000 位〜', match: range(5000, Infinity) },
]

export const TOEIC_CATEGORIES: Category[] = [
  { id: 't470', title: 'TOEIC 470', hint: 'まずはここから', match: (e) => e.toeic === 470 },
  { id: 't600', title: 'TOEIC 600', hint: '日常・基本のビジネス', match: (e) => e.toeic === 600 },
  { id: 't730', title: 'TOEIC 730', hint: '業務で使える', match: (e) => e.toeic === 730 },
  { id: 't860', title: 'TOEIC 860', hint: '幅広い話題', match: (e) => e.toeic === 860 },
  { id: 't990', title: 'TOEIC 990', hint: '満点を目指す', match: (e) => e.toeic === 990 },
  { id: 'tsl', title: 'TOEIC 頻出', hint: 'TOEIC で特に多い語', match: (e) => !!e.tsl },
]

export const POS_CATEGORIES: Category[] = [
  { id: 'pos:noun', title: '名詞', hint: '', match: (e) => e.type === 'w' && e.pos[0] === 'noun' },
  { id: 'pos:verb', title: '動詞', hint: '', match: (e) => e.type === 'w' && e.pos[0] === 'verb' },
  { id: 'pos:adj', title: '形容詞', hint: '', match: (e) => e.type === 'w' && e.pos[0] === 'adj' },
  { id: 'pos:adv', title: '副詞', hint: '', match: (e) => e.type === 'w' && e.pos[0] === 'adv' },
  {
    id: 'pos:func',
    title: '前置詞・接続詞など',
    hint: '',
    match: (e) => e.type === 'w' && ['prep', 'conj', 'pron', 'det', 'num', 'intj'].includes(e.pos[0]),
  },
]

export const PHRASE_CATEGORIES: Category[] = [
  {
    id: 'phrasal',
    title: '句動詞',
    hint: 'give up・look for など',
    match: (e) => e.type === 'p' && e.morphs.some((m) => m.startsWith('pt:')),
  },
  { id: 'idiom', title: 'そのほかの熟語', hint: 'in front of・of course など', match: (e) => e.type === 'p' && !e.morphs.some((m) => m.startsWith('pt:')) },
]

export const ALL_CATEGORIES: Category[] = [...LEVEL_CATEGORIES, ...TOEIC_CATEGORIES, ...POS_CATEGORIES, ...PHRASE_CATEGORIES]

export function categoryById(id: string | undefined): Category | undefined {
  return id ? ALL_CATEGORIES.find((c) => c.id === id) : undefined
}
