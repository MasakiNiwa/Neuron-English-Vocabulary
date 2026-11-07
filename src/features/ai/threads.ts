import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { db, type ChatThread } from '@/lib/db'

/** 保存しておくチャット履歴の上限（古いものから削除）。ピン留めしたものは数えず、削除もしない */
export const MAX_THREADS = 200

/** 現在開いているスレッド（null = 新しいチャット） */
export const useChatUi = create<{ current: string | null; setCurrent: (id: string | null) => void }>()(
  persist((set) => ({ current: null, setCurrent: (current) => set({ current }) }), { name: 'nev-chat-ui' }),
)

export async function createThread(title: string, about?: string): Promise<ChatThread> {
  const now = Date.now()
  const t: ChatThread = { id: crypto.randomUUID(), title: title.slice(0, 60), about, createdAt: now, updatedAt: now }
  await db.threads.add(t)
  await pruneThreads()
  return t
}

/** 上限を超えた古いスレッドを削除する（ピン留めは別枠なので残す） */
export async function pruneThreads() {
  const all = (await db.threads.orderBy('updatedAt').reverse().toArray()).filter((t) => !t.pinned)
  for (const old of all.slice(MAX_THREADS)) await deleteThread(old.id)
}

export async function setPinned(id: string, pinned: boolean) {
  await db.threads.update(id, { pinned: pinned || undefined })
  // ピン留めを外すと上限の数に入るので、超えた分を整理する
  if (!pinned) await pruneThreads()
}

/**
 * 履歴の検索（タイトルと会話の中身。大文字・小文字は区別しない）。
 * 見つかったスレッドの ID と、本文で見つかった場合はその前後の抜粋を返す
 */
export async function searchThreads(query: string): Promise<Map<string, string | null>> {
  const q = query.trim().toLowerCase()
  const hits = new Map<string, string | null>()
  if (!q) return hits
  for (const t of await db.threads.toArray()) if (t.title.toLowerCase().includes(q)) hits.set(t.id, null)
  await db.chats.each((m) => {
    if (hits.get(m.thread)) return
    const i = m.content.toLowerCase().indexOf(q)
    if (i < 0) return
    const from = Math.max(0, i - 20)
    hits.set(m.thread, (from > 0 ? '…' : '') + m.content.slice(from, i + q.length + 30).replace(/\s+/g, ' '))
  })
  return hits
}

export async function touchThread(id: string) {
  await db.threads.update(id, { updatedAt: Date.now() })
}

export async function deleteThread(id: string) {
  await db.transaction('rw', db.threads, db.chats, async () => {
    await db.chats.where('thread').equals(id).delete()
    await db.threads.delete(id)
  })
}

export async function deleteAllThreads() {
  await db.transaction('rw', db.threads, db.chats, async () => {
    await db.chats.clear()
    await db.threads.clear()
  })
}

export async function renameThread(id: string, title: string) {
  const t = title.trim().slice(0, 60)
  if (t) await db.threads.update(id, { title: t })
}

/** 指定したメッセージ以降を削除（編集して送り直す・再生成のため） */
export async function deleteMessagesFrom(thread: string, createdAt: number) {
  await db.chats.where('thread').equals(thread).filter((m) => m.createdAt >= createdAt).delete()
}
