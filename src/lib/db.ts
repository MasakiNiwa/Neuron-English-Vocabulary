import Dexie, { type EntityTable } from 'dexie'

/** 単語ページなどを表示した履歴（1表示 = 1行） */
export interface ViewRecord {
  id?: number
  entryId: string
  viewedAt: number
  /** どこから来たか（search / link / network / study など）。分析用 */
  source?: string
}

/** FSRS カード（ts-fsrs の Card をシリアライズしたもの） */
export interface StudyCard {
  entryId: string
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review: number | null
  addedAt: number
  suspended?: 0 | 1
}

/** 復習ログ */
export interface ReviewRecord {
  id?: number
  entryId: string
  rating: number
  state: number
  reviewedAt: number
  /** 回答に要した時間 (ms) */
  durationMs?: number
  mode?: string
  stability?: number
  difficulty?: number
}

/** 汎用キーバリュー */
export interface KeyValue {
  key: string
  value: unknown
}

/** 暗号化された秘密情報（API キーなど）。平文は保存しない */
export interface SecretRecord {
  id: string
  iv: Uint8Array
  data: ArrayBuffer
}

/** AI チャットのメッセージ */
export interface ChatRecord {
  id?: number
  thread: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  /** 呼び出したツール名（表示用） */
  tools?: string[]
  model?: string
  /** 消費トークン数（取得できた場合） */
  usage?: { input: number; output: number }
}

/** AI チャットのスレッド（会話のまとまり） */
export interface ChatThread {
  id: string
  title: string
  /** 話題にしている見出し語 */
  about?: string
  createdAt: number
  updatedAt: number
}

/** 外部 AI などで作成し取り込んだ追加解説（v3 まで。v4 で extras に移行） */
export interface EnrichmentRecord {
  entryId: string
  mnemonic?: string
  story?: string
  note?: string
  examples?: { en: string; ja: string }[]
  source?: string
  importedAt: number
}

/** 単語ごとの追加解説（1 語に複数。タブで切り替える） */
export interface ExtraNote {
  id: string
  entryId: string
  /** タブに表示する名前（作成したモデル名など） */
  title: string
  /** api = アプリ内の AI で作成 / external = 外部 AI から取り込み */
  source: 'api' | 'external'
  model?: string
  mnemonic?: string
  story?: string
  note?: string
  examples?: { en: string; ja: string }[]
  /** タブの並び順（小さいほど左） */
  order: number
  createdAt: number
}

export class NeuronDB extends Dexie {
  views!: EntityTable<ViewRecord, 'id'>
  cards!: EntityTable<StudyCard, 'entryId'>
  reviews!: EntityTable<ReviewRecord, 'id'>
  kv!: EntityTable<KeyValue, 'key'>
  secrets!: EntityTable<SecretRecord, 'id'>
  chats!: EntityTable<ChatRecord, 'id'>
  enrichments!: EntityTable<EnrichmentRecord, 'entryId'>
  threads!: EntityTable<ChatThread, 'id'>
  extras!: EntityTable<ExtraNote, 'id'>

  constructor(name = 'neuron-english-vocabulary') {
    super(name)
    // スキーマ変更時は version を上げて追記していく（既存の定義は消さない）
    this.version(1).stores({
      views: '++id, entryId, viewedAt, [entryId+viewedAt]',
      cards: 'entryId, due, state, addedAt',
      reviews: '++id, entryId, reviewedAt, [entryId+reviewedAt]',
      kv: 'key',
    })
    this.version(2).stores({
      secrets: 'id',
      chats: '++id, thread, createdAt',
      enrichments: 'entryId, importedAt',
    })
    this.version(3)
      .stores({ threads: 'id, updatedAt' })
      .upgrade(async (tx) => {
        // v2 までの単一スレッド（main）を履歴の1件として引き継ぐ
        const n = await tx.table('chats').where('thread').equals('main').count()
        if (n) {
          const now = Date.now()
          await tx.table('threads').put({ id: 'main', title: '以前のチャット', createdAt: now, updatedAt: now })
        }
      })
    this.version(4)
      .stores({ extras: 'id, entryId, [entryId+order]' })
      .upgrade(async (tx) => {
        // v3 までの追加解説（1 語に 1 件）を、複数持てる extras に移す
        const old = (await tx.table('enrichments').toArray()) as EnrichmentRecord[]
        await tx.table('extras').bulkPut(
          old.map((e) => ({
            id: crypto.randomUUID(),
            entryId: e.entryId,
            title: '外部 AI',
            source: 'external',
            mnemonic: e.mnemonic,
            story: e.story,
            note: e.note,
            examples: e.examples,
            order: 0,
            createdAt: e.importedAt ?? Date.now(),
          })),
        )
        await tx.table('enrichments').clear()
      })
  }
}

export const db = new NeuronDB()

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined
}
export async function kvSet(key: string, value: unknown) {
  await db.kv.put({ key, value })
}

export async function clearHistory() {
  await db.views.clear()
}
export async function clearStudy() {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.clear()
    await db.reviews.clear()
  })
}
export async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
  localStorage.removeItem('nev-settings')
}

/** 全データを JSON でエクスポート（バックアップ用） */
export async function exportAll(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {}
  for (const t of db.tables) {
    // API キーなど機密データは平文では保存していないが、念のため除外対象をここで管理する
    if (t.name === 'secrets') continue
    out[t.name] = await t.toArray()
  }
  return out
}

export async function importAll(data: Record<string, unknown[]>) {
  // 古いバックアップの追加解説（enrichments: 1 語 1 件）は extras の形に直して取り込む
  if (Array.isArray(data.enrichments) && data.enrichments.length) {
    const old = data.enrichments as EnrichmentRecord[]
    data = {
      ...data,
      enrichments: [],
      extras: [
        ...(Array.isArray(data.extras) ? data.extras : []),
        ...old
          .filter((e) => e && typeof e.entryId === 'string')
          .map((e) => ({
            id: crypto.randomUUID(),
            entryId: e.entryId,
            title: '外部 AI',
            source: 'external',
            mnemonic: e.mnemonic,
            story: e.story,
            note: e.note,
            examples: e.examples,
            order: 1000,
            createdAt: e.importedAt ?? Date.now(),
          })),
      ],
    }
  }
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      const rows = data[t.name]
      if (Array.isArray(rows)) await t.bulkPut(rows as never[])
    }
  })
}
