import { describe, expect, it } from 'vitest'
import { BACKUP_APP, cleanSettings, parseBackup } from './backup'

const card = { entryId: 'run', due: 1, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: 1, addedAt: 1 }

describe('parseBackup', () => {
  it('アプリのバックアップ以外は受け付けない', () => {
    expect(() => parseBackup({ data: {} })).toThrow()
    expect(() => parseBackup({ app: 'other', data: {} })).toThrow()
    expect(() => parseBackup({ app: BACKUP_APP, schemaVersion: 999, data: {} })).toThrow()
  })

  it('許可した表だけを取り込み、保管庫や不正な行は捨てる', () => {
    const b = parseBackup({
      app: BACKUP_APP,
      data: {
        kv: [{ key: 'vault', value: {} }],
        secrets: [{ id: 'k', iv: {}, data: {} }],
        cards: [card, { ...card, entryId: 'bad', state: 9 }, { ...card, due: '2026-01-01' }],
        views: [{ id: 1, entryId: 'run', viewedAt: 5 }, { entryId: 3 }],
        threads: [{ id: 't', title: 'x', createdAt: 1, updatedAt: 1 }],
        chats: [
          { id: 1, thread: 't', role: 'assistant', content: 'hi', createdAt: 2, usage: { input: 3, output: 'x' } },
          { id: 2, thread: 'missing', role: 'user', content: 'a', createdAt: 3 },
        ],
      },
    })
    expect(b.rows.cards).toHaveLength(1)
    expect(b.rows.views).toEqual([{ id: 1, entryId: 'run', viewedAt: 5 }])
    expect(b.rows.chats).toHaveLength(1)
    expect(b.rows.chats[0].usage).toBeUndefined()
    expect(b.skipped).toBe(4)
    expect(Object.keys(b.rows)).not.toContain('kv')
  })

  it('古い enrichments を extras に直す', () => {
    const b = parseBackup({ app: BACKUP_APP, data: { enrichments: [{ entryId: 'run', mnemonic: 'm', importedAt: 1 }, { entryId: 'x', mnemonic: 5 }] } })
    expect(b.rows.extras).toHaveLength(1)
    expect(b.rows.extras[0]).toMatchObject({ entryId: 'run', source: 'external', mnemonic: 'm' })
  })
})

describe('cleanSettings', () => {
  it('型と値域が合う設定だけを残す', () => {
    expect(cleanSettings({ theme: 'dark', ttsRate: 99, dailyNewLimit: 10, studyFormat: 'evil', unknown: 1 })).toEqual({ theme: 'dark', dailyNewLimit: 10 })
  })
})

describe('restoreBackup', () => {
  it('追加（merge）では重複を除き、置き換え（replace）では入れ替える', async () => {
    const { db } = await import('@/lib/db')
    const { restoreBackup } = await import('./backup')
    await db.views.bulkAdd([{ entryId: 'a', viewedAt: 1 }])
    const b = parseBackup({ app: BACKUP_APP, data: { views: [{ id: 1, entryId: 'a', viewedAt: 1 }, { id: 2, entryId: 'b', viewedAt: 2 }] } })
    await restoreBackup(b, 'merge')
    expect((await db.views.toArray()).map((v) => v.entryId).sort()).toEqual(['a', 'b'])
    await restoreBackup(parseBackup({ app: BACKUP_APP, data: { views: [{ id: 9, entryId: 'c', viewedAt: 3 }] } }), 'replace')
    expect((await db.views.toArray()).map((v) => v.entryId)).toEqual(['c'])
  })
})

describe('parseBackup の値域（レビュー B01・B06）', () => {
  it('FSRS として成り立たないカードを取り込まない', async () => {
    const { previewIntervals } = await import('@/features/study/cards')
    const bad = [{ ...card, state: 1.5 }, { ...card, reps: -1 }, { ...card, reps: 1.2 }, { ...card, due: 9e15 }, { ...card, difficulty: 99 }, { ...card, stability: -1 }]
    const b = parseBackup({ app: BACKUP_APP, data: { cards: [card, ...bad] } })
    expect(b.rows.cards).toHaveLength(1)
    expect(b.skipped).toBe(bad.length)
    // 取り込んだカードは学習画面の計算で例外にならない
    expect(() => previewIntervals(b.rows.cards[0] as never)).not.toThrow()
  })
  it('途中で終わった回答の印を復元する', () => {
    const b = parseBackup({
      app: BACKUP_APP,
      data: {
        threads: [{ id: 't', title: 'x', createdAt: 1, updatedAt: 1 }],
        chats: ['length', 'filtered', 'interrupted', 'bogus'].map((incomplete, i) => ({ id: i, thread: 't', role: 'assistant', content: 'a', createdAt: i, incomplete })),
      },
    })
    expect(b.rows.chats.map((c) => c.incomplete)).toEqual(['length', 'filtered', 'interrupted', undefined])
  })
})
