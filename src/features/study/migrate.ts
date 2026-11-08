import { db, kvSet, type ReviewRecord, type StudyCard } from '@/lib/db'
import { replay6, replay7 } from './srs'

/**
 * v1.4 までのカード（FSRS-6）を、FSRS-7 へ自動で移す。利用者の操作は要らない。
 *
 * - 回答の記録（reviews）をたどり直して、保存されている記憶の状態（安定度・難しさ）が FSRS-6 で再現できたカードだけを移す。
 *   再現できれば、そのカードの回答がすべて揃っていると確かめられる。揃っていない・確かめられないカードは FSRS-6 のまま続ける
 * - 移すのは記憶の状態だけ。次の復習日・回数・学習ステップ・保留などはそのまま（次に回答したときから FSRS-7 で決まる）
 * - 回答の記録は書き換えない。移す前のカードは kv に残しておく（もしものときに戻せるように）
 * - 1 枚ずつ短いトランザクションで、読んだときから変わっていないこと（回答・削除・復元）を確かめてから書く。何度実行しても同じ結果
 */

/** 移す前のカードを残す kv の鍵（後ろに単語の ID） */
export const BACKUP_PREFIX = 'fsrs7-before:'
/** 何枚かまとめて読む（画面を止めないように、まとめごとに一息つく） */
const BATCH = 50
/** 一括追加では、追加した順に並べるため addedAt を 1 ミリ秒ずつずらしている。その分だけ前の回答も同じ回とみなす */
const ADDED_AT_SLACK = 60_000

export interface MigrationResult {
  migrated: number
  kept: number
  skipped: number
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))

/** このカードの回の回答（古い順）。確かめられなければ null */
export function historyOf(c: StudyCard, logs: ReviewRecord[]): ReviewRecord[] | null {
  const mine = logs
    .filter((l) => l.entryId === c.entryId && l.reviewedAt >= c.addedAt - ADDED_AT_SLACK && (c.run ? l.run === c.run : true))
    .sort((a, b) => a.reviewedAt - b.reviewedAt || (a.id ?? 0) - (b.id ?? 0))
  if (mine.length !== c.reps) return null
  if (!mine.every((l) => Number.isInteger(l.rating) && l.rating >= 1 && l.rating <= 4 && Number.isFinite(l.reviewedAt))) return null
  if (mine[0].state !== 0) return null
  if (mine[mine.length - 1].reviewedAt !== c.last_review) return null
  return mine
}

/** FSRS-7 へ移したカード。移せないときは null */
export function convertCard(c: StudyCard, logs: ReviewRecord[], now: number): StudyCard | null {
  if (c.model === 7) return null
  const base = { ...c, model: 7 as const, migratedAt: now, run: c.run ?? crypto.randomUUID() }
  delete base.migration
  // まだ一度も回答していないカードは、記憶の状態がないのでそのまま移せる
  if (c.state === 0 && c.reps === 0 && c.last_review == null) {
    return logs.some((l) => l.entryId === c.entryId && l.reviewedAt >= c.addedAt - ADDED_AT_SLACK) ? null : { ...base, stability: 0, difficulty: 0, stabilityFast: 0 }
  }
  if (c.reps <= 0 || c.last_review == null) return null
  const history = historyOf(c, logs)
  if (!history) return null
  const items = history.map((l) => ({ rating: l.rating, reviewedAt: l.reviewedAt }))
  const s6 = replay6(items)
  if (!s6 || !close(s6.stability, c.stability) || !close(s6.difficulty, c.difficulty)) return null
  const s7 = replay7(items)
  if (!s7 || ![s7.stability, s7.stabilityFast, s7.difficulty].every((x) => Number.isFinite(x) && x >= 0)) return null
  return { ...base, stability: s7.stability, stabilityFast: s7.stabilityFast, difficulty: s7.difficulty }
}

let running: Promise<MigrationResult> | null = null

/** まだ FSRS-7 でなく、確かめてもいないカードを移す */
export function migrateToFsrs7(): Promise<MigrationResult> {
  running ??= run().finally(() => (running = null))
  return running
}

async function run(): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: 0, kept: 0, skipped: 0 }
  const keys = (await db.cards.toArray()).filter((c) => c.model !== 7 && c.migration !== 'kept').map((c) => c.entryId)
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH)
    const [cards, logs] = await Promise.all([db.cards.bulkGet(chunk), db.reviews.where('entryId').anyOf(chunk).toArray()])
    for (const c of cards) {
      if (!c || c.model === 7) continue
      const next = convertCard(c, logs, Date.now())
      await db.transaction('rw', db.cards, db.reviews, db.kv, async () => {
        const cur = await db.cards.get(c.entryId)
        // 読んでから回答・削除・復元があったら、今回は見送る（次に開いたときにもう一度確かめる）
        if (!cur || cur.reps !== c.reps || cur.last_review !== c.last_review || cur.model === 7 || cur.addedAt !== c.addedAt) {
          result.skipped++
          return
        }
        const n = await db.reviews.where('entryId').equals(c.entryId).count()
        if (n !== logs.filter((l) => l.entryId === c.entryId).length) {
          result.skipped++
          return
        }
        if (!next) {
          await db.cards.put({ ...cur, migration: 'kept' })
          result.kept++
          return
        }
        // 移す前のカードを残しておく（1 語ごとの鍵で）
        await kvSet(BACKUP_PREFIX + c.entryId, cur)
        await db.cards.put({ ...next, suspended: cur.suspended })
        result.migrated++
      })
    }
    // 画面の操作を止めないように一息つく
    await new Promise((r) => setTimeout(r, 0))
  }
  return result
}

/** 起動してしばらくしてから、裏で移す（学習を始める前に終わる程度の量。失敗しても学習はそのまま続けられる） */
export function scheduleMigration(delayMs = 1500) {
  setTimeout(() => {
    migrateToFsrs7()
      .then((r) => {
        if (r.migrated || r.kept) console.info('[FSRS-7] 移行', r)
      })
      .catch((e) => console.warn('[FSRS-7] 移行できませんでした（FSRS-6 のまま続けます）', e))
  }, delayMs)
}
