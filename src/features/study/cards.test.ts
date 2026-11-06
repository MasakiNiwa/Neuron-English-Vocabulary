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

import { shuffle } from './session'

describe('出題の順番', () => {
  it('shuffle は同じ要素を並べ替えるだけで、元の配列は変えない', () => {
    const xs = Array.from({ length: 30 }, (_, i) => i)
    const out = shuffle(xs)
    expect([...out].sort((a, b) => a - b)).toEqual(xs)
    expect(xs).toEqual(Array.from({ length: 30 }, (_, i) => i))
    // 30 個が毎回同じ順になることはまずない
    expect(Array.from({ length: 5 }, () => shuffle(xs).join(',')).some((s) => s !== xs.join(','))).toBe(true)
  })
})
