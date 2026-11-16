import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo } from 'react'
import { EChart, type chartColors } from '@/features/analytics/EChart'
import { EntryLink } from '@/features/dictionary/components/links'
import type { Morpheme } from '@/features/dictionary/types'
import { recallCurve, recallProbability } from '@/features/study/srs'
import { cn } from '@/lib/cn'
import { useMinuteTick } from '@/lib/clock'
import { db } from '@/lib/db'
import { useSettings } from '@/stores/settings'
import { groupStats, MIN_WORDS, RECENT_DAYS, tendency, type Tendency } from './morphStats'
import { KIND_LABEL, type QuestionKind } from './questions'

/**
 * 語源のページの「記憶の見通し」
 * ① 語源ドリルの記憶: この語源のカード（etyCards）の忘却曲線と、ドリルの回答の記録
 * ② この語源の単語の覚え具合: この語源を含む単語の学習カードから、全体と比べて苦手な傾向があるか
 */

const DAY = 86_400_000
const pct = (x: number) => `${Math.round(x * 100)}%`
const md = (t: number) => `${new Date(t).getMonth() + 1}/${new Date(t).getDate()}`
const RATING = ['', 'もう一度', '難しい', '正解', '簡単']
const RATING_CLASS = ['', 'text-danger', 'text-warn', 'text-success', 'text-accent']

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2 text-center">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  )
}

/** ① 語源ドリルの記憶 */
function DrillMemory({ m }: { m: Morpheme }) {
  const tick = useMinuteTick()
  const target = useSettings((s) => s.desiredRetention)
  const card = useLiveQuery(async () => (await db.etyCards.get(m.id)) ?? null, [m.id])
  const logs = useLiveQuery(() => db.etyReviews.where('entryId').equals(m.id).reverse().sortBy('reviewedAt'), [m.id])
  const now = useMemo(() => new Date(), [tick, card?.reps]) // eslint-disable-line react-hooks/exhaustive-deps
  const dueIn = card ? (card.due - now.getTime()) / DAY : 0
  const horizon = Math.min(365, Math.max(14, Math.ceil(Math.max(dueIn, 1) * 2)))
  const curve = useMemo(() => (card ? recallCurve(card, now, horizon) : null), [card, now, horizon])
  const yMin = curve ? Math.max(0, Math.floor((Math.min(target, ...curve.points.map((p) => p.r)) - 0.05) * 10) / 10) : 0
  const opt = useCallback(
    (c: ReturnType<typeof chartColors>) => ({
      tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => pct(Number(v)) },
      grid: { left: 40, right: 12, top: 16, bottom: 28 },
      xAxis: { type: 'value', min: 0, max: horizon, axisLabel: { color: c.muted, fontSize: 10, formatter: (v: number) => (v === 0 ? '今' : md(now.getTime() + v * DAY)) }, splitLine: { show: false } },
      yAxis: { type: 'value', min: yMin, max: 1, axisLabel: { color: c.muted, formatter: (v: number) => pct(v) }, splitLine: { lineStyle: { color: c.border } } },
      series: [
        {
          type: 'line',
          name: '思い出せる見込み',
          showSymbol: false,
          smooth: true,
          lineStyle: { color: c.root, width: 2 },
          areaStyle: { color: c.accentSoft },
          data: curve?.points.map((p) => [p.days, p.r]) ?? [],
          markLine: {
            symbol: 'none',
            silent: true,
            label: { color: c.muted, fontSize: 10 },
            data: [
              { yAxis: target, lineStyle: { color: c.success, type: 'dashed' }, label: { formatter: `目標 ${pct(target)}`, position: 'insideStartTop' } },
              ...(dueIn > 0 && dueIn <= horizon ? [{ xAxis: dueIn, lineStyle: { color: c.warn, type: 'dashed' }, label: { formatter: '次の復習', position: 'insideEndTop' } }] : []),
            ],
          },
        },
      ],
    }),
    [curve, horizon, target, dueIn, now, yMin],
  )
  if (card === undefined) return <div className="h-24" />
  if (!card || card.state === 0 || !curve)
    return (
      <p className="rounded-xl bg-surface-2 px-3 py-3 text-center text-sm text-muted">
        語源ドリルでこの語源の問題に答えると、思い出せる見込みが出ます。
        <Link to="/drill/$id" params={{ id: m.id }} className="ml-1 text-accent">
          ドリルで練習
        </Link>
      </p>
    )
  const atDue = dueIn > 0 ? recallCurve(card, now, dueIn, 1)?.points[1]?.r : undefined
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Tile value={pct(recallProbability(card, now))} label="今、思い出せる見込み" />
        <Tile value={dueIn <= 0 ? '今' : md(card.due)} label="次の復習" />
        <Tile value={atDue === undefined ? '—' : pct(atDue)} label="そのときの見込み" />
      </div>
      <EChart option={opt} height={180} />
      <p className="text-xs leading-relaxed text-muted">語源ドリルの答えから出した推定です（単語の学習とは別のカード）。ドリルで答えると曲線は引き直されます。</p>
      {logs && logs.length > 0 && (
        <details>
          <summary className="cursor-pointer select-none text-xs text-muted">ドリルの回答の記録（{logs.length} 回）</summary>
          <table className="mt-2 w-full text-xs">
            <tbody className="divide-y divide-border">
              {logs.slice(0, 30).map((l) => (
                <tr key={l.id ?? l.reviewedAt}>
                  <td className="py-1 font-mono">
                    {md(l.reviewedAt)} {new Date(l.reviewedAt).toTimeString().slice(0, 5)}
                  </td>
                  <td className={`py-1 ${RATING_CLASS[l.rating] ?? ''}`}>{RATING[l.rating] ?? l.rating}</td>
                  <td className="py-1 text-muted">{KIND_LABEL[l.kind as QuestionKind] ?? l.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}

const TENDENCY: Record<Tendency, { label: string; cls: string; text: string }> = {
  weak: { label: '苦手な傾向', cls: 'bg-danger/15 text-danger', text: 'この語源の単語は、学習中の単語全体より忘れやすいようです。語源の意味から単語をつなげて覚え直すと効果的です。' },
  strong: { label: '得意な傾向', cls: 'bg-success/15 text-success', text: 'この語源の単語は、学習中の単語全体よりよく覚えています。' },
  even: { label: '全体と同じくらい', cls: 'bg-surface-2 text-muted', text: 'この語源の単語の覚え具合は、学習中の単語全体と同じくらいです。' },
  unknown: { label: 'まだ分からない', cls: 'bg-surface-2 text-muted', text: `この語源の単語を ${MIN_WORDS} 語以上学習すると、全体と比べた傾向が出ます。` },
}

/** ② この語源の単語の覚え具合 */
function WordsMemory({ m }: { m: Morpheme }) {
  const tick = useMinuteTick()
  const data = useLiveQuery(async () => {
    const since = Date.now() - RECENT_DAYS * DAY
    const [cards, logs] = await Promise.all([db.cards.toArray(), db.reviews.where('reviewedAt').above(since).toArray()])
    return { cards, logs }
  }, [])
  const res = useMemo(() => {
    if (!data) return null
    const now = Date.now()
    const keys = new Set(m.words)
    return { g: groupStats(data.cards, data.logs, now, keys), all: groupStats(data.cards, data.logs, now) }
  }, [data, m.words, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!res) return <div className="h-24" />
  const { g, all } = res
  const t = tendency(g, all)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', TENDENCY[t].cls)}>{TENDENCY[t].label}</span>
        <span className="text-xs text-muted">
          学習中 {g.learned} / {m.words.length} 語
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile value={g.avgRecall === null ? '—' : pct(g.avgRecall)} label={`今の見込みの平均（全体 ${all.avgRecall === null ? '—' : pct(all.avgRecall)}）`} />
        <Tile
          value={g.againRate === null ? '—' : pct(g.againRate)}
          label={`最近 ${RECENT_DAYS} 日の「もう一度」（全体 ${all.againRate === null ? '—' : pct(all.againRate)}）`}
        />
      </div>
      <p className="text-xs leading-relaxed text-muted">{TENDENCY[t].text}</p>
      {g.words.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-muted">見込みの低い順</div>
          <ul className="flex flex-col gap-1 text-sm">
            {g.words.slice(0, 6).map((w) => (
              <li key={w.key} className="flex items-center gap-2">
                <EntryLink k={w.key} className="font-en">
                  {w.key.replace(/_/g, ' ')}
                </EntryLink>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className={cn('h-full', w.recall < 0.8 ? 'bg-danger' : w.recall < 0.9 ? 'bg-warn' : 'bg-success')} style={{ width: pct(w.recall) }} />
                </div>
                <span className="w-10 text-right font-mono text-xs text-muted">{pct(w.recall)}</span>
                {w.lapses > 0 && <span className="text-[11px] text-danger">忘れた {w.lapses}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function MorphMemoryPanel({ m }: { m: Morpheme }) {
  const drillable = m.type === 'root' || m.type === 'prefix' || m.type === 'suffix'
  return (
    <div className="flex flex-col gap-5">
      {drillable && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-muted">語源ドリルの記憶</h3>
          <DrillMemory m={m} />
        </section>
      )}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-muted">この語源の単語の覚え具合</h3>
        <WordsMemory m={m} />
      </section>
    </div>
  )
}
