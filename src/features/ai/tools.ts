import { db } from '@/lib/db'
import { getEntry, headword, loadDictionary } from '@/features/dictionary/data'
import { searchDictionary } from '@/features/dictionary/search'
import { addManyToStudy } from '@/features/study/cards'
import { getStudyStats } from '@/features/study/session'
import type { ToolDef } from './providers'

/**
 * LLM に渡すアプリの「道具」。判断の根拠となるデータはアプリのアルゴリズム（辞書・FSRS・集計）から取り、
 * LLM はそれを使って解説・リアクション・提案をする。
 */

export const appTools: ToolDef[] = [
  {
    name: 'search_words',
    description: '英単語・熟語・日本語訳・語根でアプリの辞書を検索する。結果は見出し語・頻度順位・短い訳。',
    parameters: { type: 'object', properties: { query: { type: 'string', description: '検索語' } }, required: ['query'] },
  },
  {
    name: 'get_word',
    description: '見出し語の詳細（意味、語の成り立ち、例文、類義語、派生語、熟語）を取得する。熟語は空白区切りで指定。',
    parameters: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] },
  },
  {
    name: 'get_root',
    description: '語根・接頭辞・接尾辞の意味と、それを含む単語の一覧を取得する（例: spec, re, tion）。',
    parameters: { type: 'object', properties: { root: { type: 'string' } }, required: ['root'] },
  },
  {
    name: 'get_learning_status',
    description: 'ユーザーの学習状況（復習予定数、最近見た単語、苦手な単語）を取得する。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'add_to_study',
    description: 'ユーザーが希望した場合に、単語を FSRS の学習カードに追加する。',
    parameters: {
      type: 'object',
      properties: { words: { type: 'array', items: { type: 'string' }, description: '見出し語の配列' } },
      required: ['words'],
    },
  },
]

async function keyOf(word: string) {
  const dict = await loadDictionary()
  return dict.byLower.get(word.toLowerCase().replace(/_/g, ' ').trim()) ?? null
}

async function wordSummary(key: string) {
  const [dict, e] = await Promise.all([loadDictionary(), getEntry(key)])
  if (!e) return null
  return {
    word: e.h,
    type: e.t === 'p' ? 'phrase' : 'word',
    frequencyRank: e.r,
    ipa: e.ipa,
    meanings: e.g.map((g) => ({ pos: g.p, ja: g.ja })),
    englishDefinitions: e.d?.flatMap((d) => d.en).slice(0, 4),
    parts: e.parts?.map((p) => {
      const m = p.m && !p.m.startsWith('w:') ? dict.morphById.get(p.m) : null
      return { spelling: p.s, morpheme: m ? { id: m.id, type: m.type, meaning: m.meaning.ja, origin: m.origin } : p.m?.startsWith('w:') ? { baseWord: p.m.slice(2) } : null }
    }),
    etymology: e.ety,
    examples: e.ex?.slice(0, 3),
    synonyms: e.syn?.map(headword),
    antonyms: e.ant?.map(headword),
    derived: e.der?.map(headword),
    phrases: e.ph?.map(headword),
  }
}

export async function runAppTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const dict = await loadDictionary()
  switch (name) {
    case 'search_words': {
      const hits = await searchDictionary(String(args.query ?? ''))
      return hits.slice(0, 15).map((h) =>
        h.kind === 'morpheme'
          ? { root: h.key, meaning: dict.morphById.get(h.key)?.meaning.ja }
          : { word: headword(h.key), rank: dict.byKey.get(h.key)?.rank, ja: dict.byKey.get(h.key)?.gloss },
      )
    }
    case 'get_word': {
      const k = await keyOf(String(args.word ?? ''))
      return k ? wordSummary(k) : { error: 'not found' }
    }
    case 'get_root': {
      const q = String(args.root ?? '').replace(/^-|-$/g, '').toLowerCase()
      const m = dict.morphemes.find((x) => x.label === q || x.forms.includes(q))
      if (!m) return { error: 'not found' }
      return {
        id: m.id,
        type: m.type,
        meaning: m.meaning.ja,
        origin: m.origin,
        spellings: m.forms,
        words: m.words.slice(0, 30).map((w) => ({ word: headword(w), ja: dict.byKey.get(w)?.gloss })),
      }
    }
    case 'get_learning_status':
      return learningSnapshot()
    case 'add_to_study': {
      const words = Array.isArray(args.words) ? (args.words as string[]) : []
      const keys = (await Promise.all(words.map(keyOf))).filter((k): k is string => !!k)
      return { added: await addManyToStudy(keys), words: keys.map(headword) }
    }
  }
  return { error: `unknown tool ${name}` }
}

export async function learningSnapshot() {
  const [stats, recent, weak] = await Promise.all([
    getStudyStats(),
    db.views.orderBy('viewedAt').reverse().limit(30).toArray(),
    db.cards.orderBy('entryId').filter((c) => c.lapses > 0).limit(10).toArray(),
  ])
  return {
    study: stats,
    recentlyViewed: [...new Set(recent.map((v) => headword(v.entryId)))].slice(0, 12),
    weakWords: weak.sort((a, b) => b.lapses - a.lapses).map((c) => headword(c.entryId)),
  }
}

/** 会話の文脈として渡すアプリの状態（構造化 JSON） */
export async function buildContext(about?: string) {
  const ctx: Record<string, unknown> = {
    app: 'ニューロン英単語（語源や意味のつながりで辿る英単語アプリ）',
    now: new Date().toISOString().slice(0, 16),
    learning: await learningSnapshot(),
  }
  if (about) ctx.currentWord = await wordSummary(about)
  return ctx
}
