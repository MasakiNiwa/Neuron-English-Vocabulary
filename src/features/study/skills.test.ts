import { describe, expect, it } from 'vitest'
import type { Entry } from '@/features/dictionary/types'
import type { ReviewRecord, StudyCard } from '@/lib/db'
import { pickFormat } from './formats'
import { lowSkillRecall } from './session'
import { allSkillRecall, logsOfRun, SKILL_OF, skillOfLog, skillRecall, skillStates } from './skills'

const T0 = Date.parse('2026-01-01T00:00:00Z')
const DAY = 86_400_000
const card = (entryId = 'run', extra: Partial<StudyCard> = {}): StudyCard => ({
  entryId, due: T0 + 30 * DAY, stability: 20, stabilityFast: 50, difficulty: 5, elapsed_days: 0, scheduled_days: 10, learning_steps: 0, reps: 6, lapses: 0, state: 2, last_review: T0 + 20 * DAY, addedAt: T0, model: 7, run: 'r1', ...extra,
})
const log = (fmt: string, rating: number, day: number, extra: Partial<ReviewRecord> = {}): ReviewRecord => ({ entryId: 'run', rating, state: 2, reviewedAt: T0 + day * DAY, mode: `review:${fmt}`, run: 'r1', ...extra })

describe('スキル別の見込み', () => {
  it('出題形式をスキルにまとめる（聞いて書くは「聞く」）', () => {
    expect(SKILL_OF.dictation).toBe('listen')
    expect(SKILL_OF.cloze).toBe('write')
    expect(skillOfLog({ mode: 'practice:choice' })).toBe('read')
    expect(skillOfLog({ mode: 'review' })).toBeNull()
    expect(skillOfLog({})).toBeNull()
  })

  it('そのスキルの回答だけから状態を作り、答えていないスキルは null', () => {
    const logs = [log('en2ja', 3, 0), log('en2ja', 3, 3), log('en2ja', 3, 10), log('ja2en', 1, 11), log('ja2en', 2, 12)]
    const st = skillStates(card(), logs)
    expect(st.read.answers).toBe(3)
    expect(st.write.answers).toBe(2)
    expect(st.write.card!.lapses).toBe(1)
    expect(st.listen.card).toBeNull()
    const r = skillRecall(card(), logs, new Date(T0 + 20 * DAY))
    expect(r.speak).toBeNull()
    expect(r.read!).toBeGreaterThan(r.write!)
  })

  it('削除して追加し直す前の回答は含めない', () => {
    const logs = [log('en2ja', 3, 0, { run: 'old' }), log('listen', 3, 1)]
    expect(logsOfRun(card(), logs).map((l) => l.mode)).toEqual(['review:listen'])
  })

  it('スキルを選んだ練習: 見込みの低い語 → まだそのスキルで答えていない語の順', () => {
    const cards = [card('a'), card('b'), card('c'), card('new', { state: 0, last_review: null })]
    const reviews = [
      { ...log('listen', 3, 0), entryId: 'a' }, { ...log('listen', 3, 5), entryId: 'a' },
      { ...log('listen', 1, 19), entryId: 'b' },
      { ...log('en2ja', 3, 1), entryId: 'c' },
    ]
    const now = T0 + 25 * DAY
    expect(lowSkillRecall(cards, reviews, 'listen', 0, now).map((c) => c.entryId)).toEqual(['b', 'a', 'c'])
    expect(allSkillRecall(cards, reviews, new Date(now)).has('new')).toBe(false)
  })
})

describe('おまかせの出題（スキル別）', () => {
  const e = { k: 'run', h: 'run', g: [{ p: 'verb', ja: ['走る'] }], ex: [{ en: 'I run every day.', ja: '毎日走る。' }] } as unknown as Entry
  const count = (skills: Record<'read' | 'listen' | 'write' | 'speak', number | null>, strength = 30) => {
    const n: Record<string, number> = {}
    let s = 12345
    // 決まった並びの乱数（0〜1 に広く散らばるもの）
    const rnd = () => {
      s = (s * 1103515245 + 12345) % 2147483648
      return s / 2147483648
    }
    for (let i = 0; i < 600; i++) {
      const f = pickFormat(['en2ja', 'ja2en'], true, e, { state: 2, strength, skills }, rnd)
      n[f] = (n[f] ?? 0) + 1
    }
    return n
  }
  it('覚えてきた語は、見込みの低いスキルの形式を多く出す', () => {
    const a = count({ read: 0.95, write: 0.6, listen: null, speak: null })
    expect(a.ja2en).toBeGreaterThan(a.en2ja * 2)
    const b = count({ read: 0.5, write: 0.95, listen: null, speak: null })
    expect(b.en2ja).toBeGreaterThan(b.ja2en * 2)
  })
  it('まだ試していないスキルを先に出す', () => {
    const a = count({ read: 0.4, write: null, listen: null, speak: null })
    expect(a.ja2en).toBeGreaterThan(a.en2ja * 2)
  })
  it('覚えかけの語は、これまでどおり意味を答える形式を中心に', () => {
    const a = count({ read: 0.95, write: null, listen: null, speak: null }, 2)
    expect(a.en2ja).toBeGreaterThan(a.ja2en * 2)
  })
})
