import { headword } from '@/features/dictionary/data'
import { FORMAT_LABEL, type ConcreteFormat } from '@/features/study/formatDefs'
import { modelOf, recallProbability } from '@/features/study/srs'
import type { StudyCard } from '@/lib/db'
import type { AnalyticsResult } from './compute'

/**
 * AI に渡す「学習のまとめ」（分析ページの集計と、FSRS の推定から作る小さな JSON）。
 * 送るのは集計した数と単語の見出しだけ。回答のメモ・チャットの内容・個人を特定する情報は含めない
 */

const pct = (x: number | null) => (x === null ? null : Math.round(x * 100))
const words = (keys: string[], n: number) => keys.slice(0, n).map(headword)

export function buildLearningSummary(
  data: AnalyticsResult,
  cards: StudyCard[],
  settings: { desiredRetention: number; dailyNewLimit: number },
  now = Date.now(),
) {
  const active = cards.filter((c) => !c.suspended)
  const learned = active.filter((c) => c.state !== 0 && c.last_review != null)
  const withRecall = (at: number) => learned.map((c) => ({ c, r: recallProbability(c, new Date(at)) })).sort((a, b) => a.r - b.r)
  const nowR = withRecall(now)
  const weekR = withRecall(now + 7 * 86_400_000)
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) : null)
  const period = (d: 7 | 28) => {
    const p = data.recent[d]
    return {
      answers: p.answers,
      words: p.words,
      studyDays: p.studyDays,
      recalledPercent: pct(p.recalled),
      goodOrEasyPercent: pct(p.goodEasy),
      recalledAfterGapWords: p.spacedRecall.length,
      enoughDataForTrend: p.enough,
    }
  }
  const cal = data.reflect.calibration.filter((b) => b.n >= 5)
  const calN = cal.reduce((n, b) => n + b.n, 0)
  return {
    note: '数は端末内の集計。割合は自己評価（もう一度=1, 難しい=2, 正解=3, 簡単=4）。想起確率は FSRS による推定で、実測ではない。',
    settings: { desiredRetentionPercent: Math.round(settings.desiredRetention * 100), dailyNewLimit: settings.dailyNewLimit },
    totals: {
      cards: active.length,
      newCards: active.filter((c) => c.state === 0).length,
      learningCards: active.filter((c) => c.state === 1 || c.state === 3).length,
      reviewCards: active.filter((c) => c.state === 2).length,
      suspended: cards.length - active.length,
      fsrs7Cards: active.filter((c) => modelOf(c) === 7).length,
      totalAnswers: data.totals.reviews,
      viewedWords: data.totals.uniqueViewed,
      streakDays: data.totals.streak,
      activeDays: data.totals.activeDays,
    },
    last7days: period(7),
    last28days: period(28),
    memory: {
      averageRecallNowPercent: avg(nowR.map((x) => x.r)),
      averageRecallIn7DaysIfNoReviewPercent: avg(weekR.map((x) => x.r)),
      recallDistributionNow: data.retention.map((r) => ({ range: r.label, cards: r.keys.length })),
      lowestRecallNow: nowR.slice(0, 10).map((x) => ({ word: headword(x.c.entryId), percent: Math.round(x.r * 100), lapses: x.c.lapses })),
      lowestRecallIn7Days: weekR.slice(0, 10).map((x) => ({ word: headword(x.c.entryId), percent: Math.round(x.r * 100) })),
      dueForecastNext7Days: data.forecast.map((d) => ({ day: d.label, cards: d.keys.length })),
    },
    stumbles: {
      last28days: data.stumbles[28].slice(0, 15).map((s) => ({ word: headword(s.key), again: s.again, answers: s.answers })),
      recoveredAfterEarlierMistake: data.recovered.length,
      mostForgottenEver: data.weak.slice(0, 10).map((w) => ({ word: headword(w.key), lapses: w.lapses })),
    },
    reflection: {
      spacing: data.reflect.spacing.map((s) => ({ kind: s.label, answers: s.total, recalledPercent: s.total ? Math.round((s.recalled / s.total) * 100) : null })),
      byFormat: data.reflect.formats.map((f) => ({
        format: FORMAT_LABEL[f.id as ConcreteFormat] ?? '不明',
        answers: f.total,
        againPercent: Math.round((f.counts[0] / f.total) * 100),
        goodOrEasyPercent: Math.round(((f.counts[2] + f.counts[3]) / f.total) * 100),
      })),
      predictedVsActual:
        calN >= 30
          ? {
              answers: calN,
              predictedPercent: Math.round((cal.reduce((s, b) => s + b.predicted * b.n, 0) / calN) * 100),
              actualRecalledPercent: Math.round((cal.reduce((s, b) => s + b.actual * b.n, 0) / calN) * 100),
            }
          : null,
    },
    roots: {
      nextFromLearnedRoots: data.rootNext.slice(0, 5).map((r) => ({ root: r.label, meaning: r.meaning, recalledWords: r.recalled, candidates: words(r.candidates, 6) })),
      mostStudied: data.roots
        .filter((r) => r.type === 'root' && r.studiedKeys.length > 0)
        .sort((a, b) => b.studiedKeys.length - a.studiedKeys.length)
        .slice(0, 6)
        .map((r) => ({ root: r.label, meaning: r.meaning, studied: r.studiedKeys.length, recalledAfterGap: r.recalledKeys.length, total: r.total })),
    },
    frequencyCoverage: data.rankBuckets.slice(0, 6).map((b) => ({ rank: b.label, total: b.total, viewed: b.viewed, studying: b.studied })),
    activeHours: data.hours
      .map((n, h) => ({ hour: h, n }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((x) => x.hour),
  }
}

export type LearningSummary = ReturnType<typeof buildLearningSummary>
