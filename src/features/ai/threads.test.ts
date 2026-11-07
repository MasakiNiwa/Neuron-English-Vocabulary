import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { createThread, deleteAllThreads, MAX_THREADS, pruneThreads, searchThreads, setPinned } from './threads'

describe('チャット履歴', () => {
  beforeEach(async () => {
    await deleteAllThreads()
  })

  it('上限を超えたら古いものから消すが、ピン留めは別枠で残す', async () => {
    const now = Date.now()
    await db.threads.bulkAdd(
      Array.from({ length: MAX_THREADS + 2 }, (_, i) => ({ id: `t${i}`, title: `t${i}`, createdAt: now - i * 1000, updatedAt: now - i * 1000 })),
    )
    // いちばん古いものをピン留め
    await setPinned(`t${MAX_THREADS + 1}`, true)
    await pruneThreads()
    const ids = new Set((await db.threads.toArray()).map((t) => t.id))
    expect(ids.has(`t${MAX_THREADS + 1}`)).toBe(true)
    expect(ids.has(`t${MAX_THREADS}`)).toBe(false)
    expect(ids.size).toBe(MAX_THREADS + 1)
    // ピン留めを外すと上限の数に入り、超えた分が消える
    await setPinned(`t${MAX_THREADS + 1}`, false)
    expect(await db.threads.count()).toBe(MAX_THREADS)
  })

  it('タイトルと会話の中身から検索し、中身の抜粋を返す', async () => {
    const a = await createThread('construct について')
    const b = await createThread('別の話')
    await db.chats.add({ thread: b.id, role: 'assistant', content: 'struct は「築く」という意味の語根です。', createdAt: Date.now() })
    const hits = await searchThreads('STRUCT')
    expect(hits.has(a.id)).toBe(true)
    expect(hits.get(a.id)).toBeNull()
    expect(hits.get(b.id)).toContain('struct は')
    expect((await searchThreads('  ')).size).toBe(0)
  })
})
