import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import { useAiConfig } from './config'
import { splitBySpeaker } from './personas'
import { runTask } from './service'
import { isUnlocked } from './vault'

/** 学習セッション後の AI のひとこと（設定でオン・API キーがありロック解除中のときだけ） */
export function StudyReaction({ since }: { since: number }) {
  const { keys, cast, reactionAfterStudy } = useAiConfig()
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!reactionAfterStudy || !keys.length || !isUnlocked()) return
    let alive = true
    setLoading(true)
    void (async () => {
      const logs = await db.reviews.where('reviewedAt').aboveOrEqual(since).toArray()
      const summary = {
        answered: logs.length,
        again: logs.filter((l) => l.rating === 1).map((l) => l.entryId.replace(/_/g, ' ')),
        easy: logs.filter((l) => l.rating === 4).map((l) => l.entryId.replace(/_/g, ' ')),
      }
      try {
        const res = await runTask({
          task: 'reaction',
          cast,
          useTools: false,
          messages: [{ role: 'user', content: `学習セッションが終わりました。結果: ${JSON.stringify(summary)}\n2〜3文の短いリアクションと、間違えた単語があれば語源のヒントをひとつ添えてください。` }],
        })
        if (alive) setText(res.text)
      } catch {
        /* AI は任意機能なので失敗しても何も表示しない */
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [since, keys.length, cast, reactionAfterStudy])
  if (loading) return <Loader2 className="size-4 animate-spin text-muted" />
  if (!text) return null
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {splitBySpeaker(text).map((p, i) => (
        <p key={i} className="text-sm leading-relaxed">
          <span className="mr-1">{p.persona?.emoji ?? '🤖'}</span>
          {p.text}
        </p>
      ))}
    </div>
  )
}
