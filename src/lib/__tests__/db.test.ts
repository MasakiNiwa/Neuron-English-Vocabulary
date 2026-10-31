import { describe, expect, it } from 'vitest'
import { NeuronDB } from '../db'

describe('NeuronDB', () => {
  it('records and clears views', async () => {
    const db = new NeuronDB('test-db')
    await db.views.add({ entryId: 'w:run', viewedAt: 1 })
    await db.views.add({ entryId: 'w:run', viewedAt: 2 })
    expect(await db.views.where('entryId').equals('w:run').count()).toBe(2)
    await db.views.clear()
    expect(await db.views.count()).toBe(0)
  })
})
