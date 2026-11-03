import { Rating } from 'ts-fsrs'
import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { addToStudy, review } from './cards'

describe('review', () => {
  it('同時に 2 回呼ばれても、それぞれ最新のカードを元に計算する（B02）', async () => {
    await addToStudy('run')
    await Promise.all([review('run', Rating.Good), review('run', Rating.Good)])
    const c = await db.cards.get('run')
    expect(c?.reps).toBe(2)
    expect(await db.reviews.where('entryId').equals('run').count()).toBe(2)
  })
})
