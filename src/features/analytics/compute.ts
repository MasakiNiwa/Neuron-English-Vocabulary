import type { ReviewRecord, StudyCard, ViewRecord } from '@/lib/db'
import type { IndexRow, Morpheme } from '@/features/dictionary/types'

/**
 * 分析データの集計（純粋関数。Web Worker からもテストからも呼べる）
 */

export interface DayStat {
  date: string
  views: number
  reviews: number
}

export interface Bucket {
  id: string
  label: string
  total: number
  viewed: number
  studied: number
  /** ドリルダウン用 */
  unseen: string[]
  seen: string[]
}

export interface RootCoverage {
  id: string
  label: string
  meaning: string
  type: string
  total: number
  seen: number
  seenKeys: string[]
  unseenKeys: string[]
}

export interface Insight {
  kind: 'streak' | 'root' | 'weak' | 'coverage' | 'review' | 'start'
  text: string
  /** 関連する見出し語（ドリルダウン用） */
  keys?: string[]
  morph?: string
}

export interface AnalyticsResult {
  totals: {
    views: number
    uniqueViewed: number
    cards: number
    reviews: number
    accuracy: number | null
    streak: number
    activeDays: number
  }
  days: DayStat[]
  dayKeys: Record<string, { viewed: string[]; reviewed: string[] }>
  states: { state: number; label: string; keys: string[] }[]
  retention: { label: string; keys: string[] }[]
  rankBuckets: Bucket[]
  roots: RootCoverage[]
  weak: { key: string; lapses: number; again: number }[]
  hours: number[]
  insights: Insight[]
}

const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function computeAnalytics(input: {
  views: ViewRecord[]
  cards: StudyCard[]
  reviews: ReviewRecord[]
  index: IndexRow[]
  morphemes: Morpheme[]
  retrievability: Record<string, number>
  now?: number
}): AnalyticsResult {
  const { views, cards, reviews, index, morphemes, retrievability } = input
  const now = input.now ?? Date.now()
  const viewedSet = new Set(views.map((v) => v.entryId))
  const studiedSet = new Set(cards.map((c) => c.entryId))

  // ---- 日別
  const dayMap = new Map<string, DayStat>()
  const dayKeys: AnalyticsResult['dayKeys'] = {}
  const touch = (t: number) => {
    const k = dayKey(t)
    let d = dayMap.get(k)
    if (!d) {
      d = { date: k, views: 0, reviews: 0 }
      dayMap.set(k, d)
      dayKeys[k] = { viewed: [], reviewed: [] }
    }
    return d
  }
  const hours = new Array(24).fill(0) as number[]
  for (const v of views) {
    touch(v.viewedAt).views++
    const dk = dayKeys[dayKey(v.viewedAt)]
    if (!dk.viewed.includes(v.entryId)) dk.viewed.push(v.entryId)
    hours[new Date(v.viewedAt).getHours()]++
  }
  let correct = 0
  for (const r of reviews) {
    touch(r.reviewedAt).reviews++
    const dk = dayKeys[dayKey(r.reviewedAt)]
    if (!dk.reviewed.includes(r.entryId)) dk.reviewed.push(r.entryId)
    hours[new Date(r.reviewedAt).getHours()]++
    if (r.rating >= 3) correct++
  }
  const days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  // ---- 連続日数
  let streak = 0
  for (let t = now; ; t -= 86400000) {
    if (dayMap.has(dayKey(t))) streak++
    else if (t !== now) break
    else continue
  }

  // ---- FSRS 状態
  const stateLabels = ['新規', '学習中', '復習', '再学習']
  const states = stateLabels.map((label, state) => ({
    state,
    label,
    keys: cards.filter((c) => c.state === state).map((c) => c.entryId),
  }))
  const retBuckets = [
    { label: '〜50%', min: 0, max: 0.5 },
    { label: '50〜70%', min: 0.5, max: 0.7 },
    { label: '70〜85%', min: 0.7, max: 0.85 },
    { label: '85〜95%', min: 0.85, max: 0.95 },
    { label: '95%〜', min: 0.95, max: 1.01 },
  ]
  const retention = retBuckets.map((b) => ({
    label: b.label,
    keys: cards
      .filter((c) => c.last_review && retrievability[c.entryId] >= b.min && retrievability[c.entryId] < b.max)
      .map((c) => c.entryId),
  }))

  // ---- 頻度帯カバレッジ
  const words = index.filter((r) => r[1] === 0)
  const bandSize = 1000
  const rankBuckets: Bucket[] = []
  for (let start = 1; start <= words.length; start += bandSize) {
    const band = words.filter((r) => r[2] >= start && r[2] < start + bandSize)
    const seen = band.filter((r) => viewedSet.has(r[0]) || studiedSet.has(r[0])).map((r) => r[0])
    rankBuckets.push({
      id: `w${start}`,
      label: `${start}〜${start + bandSize - 1}`,
      total: band.length,
      viewed: band.filter((r) => viewedSet.has(r[0])).length,
      studied: band.filter((r) => studiedSet.has(r[0])).length,
      seen,
      unseen: band.filter((r) => !viewedSet.has(r[0]) && !studiedSet.has(r[0])).map((r) => r[0]),
    })
  }
  const phrases = index.filter((r) => r[1] === 1)
  rankBuckets.push({
    id: 'p',
    label: '熟語',
    total: phrases.length,
    viewed: phrases.filter((r) => viewedSet.has(r[0])).length,
    studied: phrases.filter((r) => studiedSet.has(r[0])).length,
    seen: phrases.filter((r) => viewedSet.has(r[0]) || studiedSet.has(r[0])).map((r) => r[0]),
    unseen: phrases.filter((r) => !viewedSet.has(r[0]) && !studiedSet.has(r[0])).map((r) => r[0]),
  })

  // ---- 語根カバレッジ
  const roots: RootCoverage[] = morphemes
    .filter((m) => m.words.length >= 3)
    .map((m) => {
      const seenKeys = m.words.filter((w) => viewedSet.has(w) || studiedSet.has(w))
      return {
        id: m.id,
        label: m.type === 'prefix' ? `${m.label}-` : m.type === 'suffix' ? `-${m.label}` : m.label,
        meaning: m.meaning.ja,
        type: m.type,
        total: m.words.length,
        seen: seenKeys.length,
        seenKeys,
        unseenKeys: m.words.filter((w) => !viewedSet.has(w) && !studiedSet.has(w)),
      }
    })

  // ---- 苦手
  const againCount = new Map<string, number>()
  for (const r of reviews) if (r.rating === 1) againCount.set(r.entryId, (againCount.get(r.entryId) ?? 0) + 1)
  const weak = cards
    .map((c) => ({ key: c.entryId, lapses: c.lapses, again: againCount.get(c.entryId) ?? 0 }))
    .filter((w) => w.lapses > 0 || w.again > 0)
    .sort((a, b) => b.again + b.lapses * 2 - (a.again + a.lapses * 2))
    .slice(0, 30)

  // ---- 気づき
  const insights: Insight[] = []
  if (!views.length && !cards.length) {
    insights.push({ kind: 'start', text: 'まずは気になる単語を検索したり、「つながり」で語根のネットワークを眺めてみましょう。' })
  }
  if (streak >= 2) insights.push({ kind: 'streak', text: `${streak} 日連続で学習しています。この調子！` })
  const rootsInProgress = roots
    .filter((r) => r.type === 'root' && r.seen >= 2 && r.seen < r.total)
    .sort((a, b) => b.seen / b.total - a.seen / a.total)
  if (rootsInProgress[0]) {
    const r = rootsInProgress[0]
    insights.push({
      kind: 'root',
      text: `語根「${r.label}（${r.meaning}）」の単語を ${r.seen}/${r.total} 語見ています。残りの ${r.total - r.seen} 語も辿ると、このグループを制覇できます。`,
      keys: r.unseenKeys,
      morph: r.id,
    })
  }
  const unexplored = roots
    .filter((r) => r.type === 'root' && r.seen === 0 && r.total >= 8)
    .sort((a, b) => b.total - a.total)[0]
  if (unexplored && views.length) {
    insights.push({
      kind: 'root',
      text: `よく使われる語根「${unexplored.label}（${unexplored.meaning}）」はまだ未開拓です。${unexplored.total} 語とつながっています。`,
      keys: unexplored.unseenKeys,
      morph: unexplored.id,
    })
  }
  if (weak[0]) {
    insights.push({
      kind: 'weak',
      text: `苦手な単語: ${weak
        .slice(0, 5)
        .map((w) => w.key.replace(/_/g, ' '))
        .join(', ')}。語の成り立ちや例文を見直すと定着しやすくなります。`,
      keys: weak.map((w) => w.key),
    })
  }
  const firstGap = rankBuckets.find((b) => b.id !== 'p' && b.seen.length / Math.max(1, b.total) < 0.5)
  if (firstGap && (views.length || cards.length)) {
    insights.push({
      kind: 'coverage',
      text: `頻度 ${firstGap.label} 位の単語のうち、触れたのは ${firstGap.seen.length}/${firstGap.total} 語です。`,
      keys: firstGap.unseen,
    })
  }
  const dueSoon = cards.filter((c) => c.state !== 0 && c.due <= now + 86400000).length
  if (dueSoon) insights.push({ kind: 'review', text: `24 時間以内に復習期限を迎えるカードが ${dueSoon} 枚あります。` })

  return {
    totals: {
      views: views.length,
      uniqueViewed: viewedSet.size,
      cards: cards.length,
      reviews: reviews.length,
      accuracy: reviews.length ? correct / reviews.length : null,
      streak,
      activeDays: dayMap.size,
    },
    days,
    dayKeys,
    states,
    retention,
    rankBuckets,
    roots,
    weak,
    hours,
    insights,
  }
}
