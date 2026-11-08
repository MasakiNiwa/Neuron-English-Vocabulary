import { beforeEach, describe, expect, it } from 'vitest'
import { db, kvGet, type StudyCard } from '@/lib/db'
import { BACKUP_PREFIX, migrateToFsrs7 } from './migrate'
import { reviewCard } from './srs'

const T0 = Date.parse('2026-01-01T00:00:00Z')
const DAY = 86_400_000

function legacyCard(entryId: string, addedAt = T0): StudyCard {
  return { entryId, due: addedAt, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null, addedAt }
}

/** v1.4 までと同じ形で、カードと回答の記録を保存する */
async function seed(entryId: string, ratings: (1 | 2 | 3 | 4)[], opts: { dropLog?: number; suspended?: 0 | 1 } = {}) {
  let c = legacyCard(entryId)
  let t = T0
  for (const [i, g] of ratings.entries()) {
    t += i === 0 ? 0 : DAY
    const next = reviewCard(c, g, new Date(t), 0.9)
    if (opts.dropLog !== i) await db.reviews.add({ entryId, rating: g, state: c.state, reviewedAt: t, stability: next.stability, difficulty: next.difficulty })
    c = next
  }
  await db.cards.put({ ...c, suspended: opts.suspended })
  return c
}

beforeEach(async () => {
  await db.cards.clear()
  await db.reviews.clear()
  await db.kv.clear()
})

describe('migrateToFsrs7', () => {
  it('確かめられたカードを移し、確かめられないカードは FSRS-6 のまま印を付ける', async () => {
    const ok = await seed('ok', [3, 3, 1, 3], { suspended: 1 })
    await seed('gap', [3, 3, 3], { dropLog: 1 })
    await db.cards.put(legacyCard('fresh'))
    const r = await migrateToFsrs7()
    expect(r).toEqual({ migrated: 2, kept: 1, skipped: 0 })

    const after = (await db.cards.get('ok'))!
    expect(after.model).toBe(7)
    expect(after.due).toBe(ok.due)
    expect(after.reps).toBe(ok.reps)
    expect(after.suspended).toBe(1)
    expect(after.run).toBeTruthy()
    // 移す前のカードを残している
    expect(await kvGet(BACKUP_PREFIX + 'ok')).toMatchObject({ entryId: 'ok', stability: ok.stability })

    expect((await db.cards.get('gap'))!.model).toBeUndefined()
    expect((await db.cards.get('gap'))!.migration).toBe('kept')
    expect((await db.cards.get('fresh'))!.model).toBe(7)
    // 回答の記録は書き換えない
    expect(await db.reviews.count()).toBe(4 + 2)
  })

  it('何度実行しても同じ結果（二重に移さない）', async () => {
    await seed('ok', [3, 3])
    await migrateToFsrs7()
    const first = await db.cards.get('ok')
    expect(await migrateToFsrs7()).toEqual({ migrated: 0, kept: 0, skipped: 0 })
    expect(await db.cards.get('ok')).toEqual(first)
  })
})
