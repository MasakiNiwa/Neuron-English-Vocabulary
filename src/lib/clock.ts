import { useEffect, useState } from 'react'

/**
 * 画面を開いたままでも「期限が来た」「日付が変わった」を反映するための時計。
 * 1 分ごとと、タブに戻ってきたときに値が変わる。useLiveQuery の依存に入れると件数を数え直す（ROADMAP B08）。
 */
export function useMinuteTick(): number {
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 60000))
  useEffect(() => {
    const update = () => setTick(Math.floor(Date.now() / 60000))
    const id = setInterval(update, 60000)
    const onVis = () => document.visibilityState === 'visible' && update()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', update)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', update)
    }
  }, [])
  return tick
}
