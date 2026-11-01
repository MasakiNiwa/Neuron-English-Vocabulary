import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { db, type ChatThread } from '@/lib/db'

/** 保存しておくチャット履歴の上限（古いものから削除） */
export const MAX_THREADS = 50

/** 現在開いているスレッド（null = 新しいチャット） */
export const useChatUi = create<{ current: string | null; setCurrent: (id: string | null) => void }>()(
  persist((set) => ({ current: null, setCurrent: (current) => set({ current }) }), { name: 'nev-chat-ui' }),
)

export async function createThread(title: string, about?: string): Promise<ChatThread> {
  const now = Date.now()
  const t: ChatThread = { id: crypto.randomUUID(), title: title.slice(0, 60), about, createdAt: now, updatedAt: now }
  await db.threads.add(t)
  // 上限を超えた古いスレッドを削除
  const all = await db.threads.orderBy('updatedAt').reverse().toArray()
  for (const old of all.slice(MAX_THREADS)) await deleteThread(old.id)
  return t
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
