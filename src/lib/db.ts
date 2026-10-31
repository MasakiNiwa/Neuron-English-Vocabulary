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

export class NeuronDB extends Dexie {
  views!: EntityTable<ViewRecord, 'id'>
  cards!: EntityTable<StudyCard, 'entryId'>
  reviews!: EntityTable<ReviewRecord, 'id'>
  kv!: EntityTable<KeyValue, 'key'>

  constructor(name = 'neuron-english-vocabulary') {
    super(name)
    // スキーマ変更時は version を上げて追記していく（既存の定義は消さない）
    this.version(1).stores({
      views: '++id, entryId, viewedAt, [entryId+viewedAt]',
      cards: 'entryId, due, state, addedAt',
      reviews: '++id, entryId, reviewedAt, [entryId+reviewedAt]',
      kv: 'key',
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
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      const rows = data[t.name]
      if (Array.isArray(rows)) await t.bulkPut(rows as never[])
    }
  })
}
