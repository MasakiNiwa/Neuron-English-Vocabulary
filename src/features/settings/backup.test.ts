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
    expect(cleanSettings({ theme: 'dark', ttsRate: 99, dailyNewLimit: 10, studyFormat: 'evil', studyFormats: ['evil'], unknown: 1 })).toEqual({ theme: 'dark', dailyNewLimit: 10 })
    expect(cleanSettings({ studyFormat: 'mix' })).toEqual({ studyFormats: ['en2ja', 'choice', 'ja2en', 'cloze'] })
    expect(cleanSettings({ studyFormats: ['listen', 'listen', 'bad'], studyAuto: false })).toEqual({ studyFormats: ['listen'], studyAuto: false })
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

describe('復元の安全性（レビュー 2026-11-07 の 02・03）', () => {
  it('表が壊れている（配列でない）バックアップは復元しない', () => {
    expect(() => parseBackup({ app: BACKUP_APP, schemaVersion: 2, data: { cards: 'damaged' } })).toThrow(/学習カード/)
  })
  it('置き換えでも、バックアップに含まれていない表は今のデータのまま残す', async () => {
    const { db } = await import('@/lib/db')
    const { restoreBackup } = await import('./backup')
    await db.cards.clear()
    await db.cards.put(card as never)
    await db.views.clear()
    const b = parseBackup({ app: BACKUP_APP, data: { views: [{ id: 1, entryId: 'x', viewedAt: 1 }] } })
    expect(b.present).toEqual(['views'])
    await restoreBackup(b, 'replace')
    expect(await db.cards.count()).toBe(1)
    expect(await db.views.count()).toBe(1)
    // 空の配列は「本当に 0 件」として置き換える
    await restoreBackup(parseBackup({ app: BACKUP_APP, data: { cards: [] } }), 'replace')
    expect(await db.cards.count()).toBe(0)
  })
  it('追加では語根レッスンの最高点・回数を古いバックアップで戻さない', async () => {
    const { db } = await import('@/lib/db')
    const { restoreBackup } = await import('./backup')
    await db.rootLessons.clear()
    await db.rootLessons.put({ id: 'r:spec', completedAt: 200, correct: 6, total: 6, best: 6, plays: 3 })
    const old = parseBackup({ app: BACKUP_APP, data: { rootLessons: [{ id: 'r:spec', completedAt: 100, correct: 2, total: 6, best: 2, plays: 1 }] } })
    await restoreBackup(old, 'merge')
    await restoreBackup(old, 'merge') // 同じファイルをもう一度追加しても回数は増えない
    expect(await db.rootLessons.get('r:spec')).toMatchObject({ completedAt: 200, correct: 6, best: 6, plays: 3 })
    // 新しい記録は最後の結果として取り込み、最高点は大きい方
    await restoreBackup(parseBackup({ app: BACKUP_APP, data: { rootLessons: [{ id: 'r:spec', completedAt: 300, correct: 4, total: 6, best: 5, plays: 5 }] } }), 'merge')
    expect(await db.rootLessons.get('r:spec')).toMatchObject({ completedAt: 300, correct: 4, best: 6, plays: 5 })
  })
  it('追加では設定を変えない', async () => {
    const { useSettings } = await import('@/stores/settings')
    const { restoreBackup } = await import('./backup')
    useSettings.setState({ theme: 'light' })
    await restoreBackup(parseBackup({ app: BACKUP_APP, data: {}, settings: { theme: 'dark' } }), 'merge')
    expect(useSettings.getState().theme).toBe('light')
    await restoreBackup(parseBackup({ app: BACKUP_APP, data: {}, settings: { theme: 'dark' } }), 'replace')
    expect(useSettings.getState().theme).toBe('dark')
  })
})

describe('FSRS-7 のカード（バックアップ schema 3）', () => {
  const c7 = { ...card, model: 7, stabilityFast: 12.5, scheduled_days: 3.27, run: 'r1', migratedAt: 5 }
  it('記憶モデルと速い記憶の成分をいっしょに取り込む', () => {
    const b = parseBackup({ app: BACKUP_APP, schemaVersion: 3, data: { cards: [c7] } })
    expect(b.rows.cards[0]).toMatchObject({ model: 7, stabilityFast: 12.5, scheduled_days: 3.27, run: 'r1' })
  })
  it('成分が欠けた FSRS-7 のカード・知らないモデル・小数の日数の FSRS-6 カードは取り込まない', () => {
    const { stabilityFast: _s, ...noFast } = c7
    const b = parseBackup({ app: BACKUP_APP, data: { cards: [noFast, { ...c7, model: 8 }, { ...card, scheduled_days: 1.5 }] } })
    expect(b.rows.cards).toHaveLength(0)
  })
  it('回答の記録の新しい項目（model・recall・run・uid）を取り込み、同じ回答は ID で見分ける', async () => {
    const { db } = await import('@/lib/db')
    const { restoreBackup } = await import('./backup')
    await db.reviews.clear()
    const r = { entryId: 'run', rating: 3, state: 2, reviewedAt: 10, model: 7, recall: 0.8, run: 'r1', uid: 'u1' }
    const b = parseBackup({ app: BACKUP_APP, data: { reviews: [r, { ...r, uid: 'u2' }, { ...r, recall: 2 }] } })
    expect(b.rows.reviews).toHaveLength(2)
    await restoreBackup(b, 'merge')
    await restoreBackup(b, 'merge')
    // 同じ時刻でも ID の違う 2 つの回答は両方残り、同じものは 2 回入らない
    expect(await db.reviews.count()).toBe(2)
  })
})
