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
  /** 学習カードにした語 */
  studiedKeys: string[]
  /** 日をあけて思い出せた語（studiedKeys の一部） */
  recalledKeys: string[]
  /** 見ただけ（カードにしていない）の語 */
  viewedOnlyKeys: string[]
}

/** 期間（最近 n 日）の回答のまとめ */
export interface PeriodStats {
  days: number
  /** 確定した回答の数（同じ語の繰り返しも数える） */
  answers: number
  /** 回答した語の数 */
  words: number
  /** 「難しい」以上（思い出せたと自分で評価した）の割合 */
  recalled: number | null
  /** 「正解」「簡単」の割合 */
  goodEasy: number | null
  /** 回答した日の数 */
  studyDays: number
  /** 傾向を出すのに十分な記録があるか（回答 20 件・5 語・2 日以上。暫定の目安） */
  enough: boolean
  /** 日をあけて思い出せた語（この期間の最後の回答が「難しい」以上で、最初の回答とは別の日） */
  spacedRecall: string[]
}

/** 最近つまずいた語（期間内に「もう一度」があり、その後まだ日をあけて思い出せていない） */
export interface Stumble {
  key: string
  again: number
  answers: number
  lastAgainAt: number
}

/** 学んだ語根から、次に学べる語 */
export interface RootNext {
  id: string
  label: string
  meaning: string
  recalled: number
  studied: number
  /** まだカードにしていない語（見た語を先に） */
  candidates: string[]
}

export interface Insight {
  kind: 'streak' | 'root' | 'weak' | 'coverage' | 'review' | 'start'
  text: string
  /** 関連する見出し語（ドリルダウン用） */
  keys?: string[]
  morph?: string
}

export interface AnalyticsResult {
  /** 最近 7 日・28 日 */
  recent: Record<7 | 28, PeriodStats>
  stumbles: Record<7 | 28, Stumble[]>
  /** 前に「もう一度」を選んだ語のうち、そのあと別の日に思い出せた語 */
  recovered: string[]
  /** 今後 7 日の復習予定（今の予定。回答すると変わる）。0 日目は期限を過ぎたものを含む */
  forecast: { date: string; label: string; keys: string[] }[]
  rootNext: RootNext[]
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
  // 保留にしたカードは、おすすめ・予定には出さない
  const activeCards = cards.filter((c) => !c.suspended)
  const activeSet = new Set(activeCards.map((c) => c.entryId))

  // ---- 語ごとの回答（古い順）
  const byKey = new Map<string, ReviewRecord[]>()
  for (const r of [...reviews].sort((a, b) => a.reviewedAt - b.reviewedAt || (a.id ?? 0) - (b.id ?? 0))) {
    const l = byKey.get(r.entryId)
    if (l) l.push(r)
    else byKey.set(r.entryId, [r])
  }
  /** 日をあけて思い出せた: 最後の回答が「難しい」以上で、その語を初めて回答した日より後の日 */
  const spaced = (list: ReviewRecord[]) => {
    const last = list[list.length - 1]
    return !!last && last.rating >= 2 && dayKey(last.reviewedAt) !== dayKey(list[0].reviewedAt)
  }
  const recalledSet = new Set([...byKey].filter(([k, l]) => studiedSet.has(k) && spaced(l)).map(([k]) => k))

  const startOfDay = (t: number) => {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const period = (days: 7 | 28): PeriodStats => {
    const since = startOfDay(now) - (days - 1) * 86400000
    const rs = reviews.filter((r) => r.reviewedAt >= since && r.reviewedAt <= now)
    const words = new Set(rs.map((r) => r.entryId))
    const studyDays = new Set(rs.map((r) => dayKey(r.reviewedAt))).size
    const n = rs.length
    const inPeriod = new Map<string, ReviewRecord[]>()
    for (const r of [...rs].sort((a, b) => a.reviewedAt - b.reviewedAt)) inPeriod.set(r.entryId, [...(inPeriod.get(r.entryId) ?? []), r])
    return {
      days,
      answers: n,
      words: words.size,
      recalled: n ? rs.filter((r) => r.rating >= 2).length / n : null,
      goodEasy: n ? rs.filter((r) => r.rating >= 3).length / n : null,
      studyDays,
      enough: n >= 20 && words.size >= 5 && studyDays >= 2,
      // 期間内の最後の回答が思い出せていて、その語を初めて回答した日（期間の前も含む）より後
      spacedRecall: [...inPeriod.keys()].filter((k) => {
        const all = byKey.get(k)!
        const last = inPeriod.get(k)!.at(-1)!
        return last.rating >= 2 && dayKey(last.reviewedAt) !== dayKey(all[0].reviewedAt)
      }),
    }
  }

  // ---- 最近つまずいた語（累積ではなく期間内。そのあと別の日に思い出せた語は外す）
  const recovered: string[] = []
  for (const [k, list] of byKey) {
    if (!activeSet.has(k)) continue
    let lastAgain = -1
    list.forEach((r, i) => r.rating === 1 && (lastAgain = i))
    if (lastAgain < 0) continue
    const againDay = dayKey(list[lastAgain].reviewedAt)
    if (list.slice(lastAgain + 1).some((r) => r.rating >= 2 && dayKey(r.reviewedAt) !== againDay)) recovered.push(k)
  }
  const recoveredSet = new Set(recovered)
  const stumblesIn = (days: 7 | 28): Stumble[] => {
    const since = startOfDay(now) - (days - 1) * 86400000
    const out: Stumble[] = []
    for (const [k, list] of byKey) {
      if (!activeSet.has(k) || recoveredSet.has(k)) continue
      const rs = list.filter((r) => r.reviewedAt >= since)
      const again = rs.filter((r) => r.rating === 1)
      if (!again.length) continue
      out.push({ key: k, again: again.length, answers: rs.length, lastAgainAt: again[again.length - 1].reviewedAt })
    }
    return out.sort((a, b) => b.again - a.again || b.lastAgainAt - a.lastAgainAt)
  }

  // ---- 今後 7 日の予定
  const today0 = startOfDay(now)
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today0 + i * 86400000)
    return { date: dayKey(d.getTime()), label: i === 0 ? '今日' : i === 1 ? '明日' : `${d.getMonth() + 1}/${d.getDate()}`, keys: [] as string[] }
  })
  for (const c of activeCards) {
    if (c.state === 0) continue
    const i = Math.max(0, Math.floor((startOfDay(c.due) - today0) / 86400000 + 0.5))
    if (i < 7) forecast[i].keys.push(c.entryId)
  }

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
      const studiedKeys = m.words.filter((w) => studiedSet.has(w))
      return {
        studiedKeys,
        recalledKeys: studiedKeys.filter((w) => recalledSet.has(w)),
        viewedOnlyKeys: m.words.filter((w) => viewedSet.has(w) && !studiedSet.has(w)),
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

  // ---- 学んだ語根から次の語へ（日をあけて思い出せた語が 2 語以上ある語根で、まだカードにしていない語があるもの）
  const rootNext: RootNext[] = roots
    .filter((r) => r.type === 'root' && r.recalledKeys.length >= 2 && r.studiedKeys.length < r.total)
    .map((r) => ({
      id: r.id,
      label: r.label,
      meaning: r.meaning,
      recalled: r.recalledKeys.length,
      studied: r.studiedKeys.length,
      candidates: [...r.viewedOnlyKeys, ...r.unseenKeys],
    }))
    .sort((a, b) => b.recalled - a.recalled || b.candidates.length - a.candidates.length)
    .slice(0, 10)

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
  // 苦手は累計ではなく最近 28 日のつまずきで（昔の失敗が残り続けないように）
  const recentWeak = stumblesIn(28)
  if (recentWeak[0]) {
    insights.push({
      kind: 'weak',
      text: `最近つまずいた単語: ${recentWeak
        .slice(0, 5)
        .map((w) => w.key.replace(/_/g, ' '))
        .join(', ')}。語の成り立ちや例文を見直すと定着しやすくなります。`,
      keys: recentWeak.map((w) => w.key),
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
    recent: { 7: period(7), 28: period(28) },
    stumbles: { 7: stumblesIn(7), 28: stumblesIn(28) },
    recovered,
    forecast,
    rootNext,
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
