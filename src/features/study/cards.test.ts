import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { addToStudy, Rating, review } from './cards'
import { buildQueue } from './session'

describe('FSRS study cards', () => {
  beforeEach(async () => {
    await db.cards.clear()
    await db.reviews.clear()
  })

  it('adds a card and schedules after review', async () => {
    await addToStudy('construct')
    let c = await db.cards.get('construct')
    expect(c?.state).toBe(0)
    expect((await buildQueue()).map((x) => x.entryId)).toEqual(['construct'])
    await review('construct', Rating.Good)
    c = await db.cards.get('construct')
    expect(c!.reps).toBe(1)
    expect(c!.due).toBeGreaterThan(Date.now())
    expect(await db.reviews.count()).toBe(1)
  })
})
