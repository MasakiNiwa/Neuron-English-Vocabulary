import { db, type EnrichmentRecord } from '@/lib/db'
import { defaultSettings, useSettings, type Settings } from '@/stores/settings'
import { sanitizeExtra } from '@/features/ai/extras'
import { ALL_FORMATS, migrateFormat, type ConcreteFormat } from '@/features/study/formatDefs'

/**
 * バックアップ（JSON）の作成・検証・復元。
 *
 * - 含めるもの: 表示履歴・学習カード・復習ログ・AI チャット・追加の解説・表示や学習の設定
 * - 含めないもの: API キーの保管庫（secrets と kv の vault）・モデル一覧のキャッシュ・AI の接続設定。
 *   保管庫は端末の鍵と対になっていて、JSON で往復すると型が失われて解除できなくなるため（ROADMAP B01）
 * - 復元時はアプリ識別子・形式の版・表の許可リスト・各行の型と値域を確かめ、合わないものは取り込まない（B10）
 */

export const BACKUP_APP = 'neuron-english-vocabulary'
/** 3: カードに記憶モデル（FSRS-7）・回答の記録に model / recall / run / uid（v2.0） */
export const BACKUP_SCHEMA = 3

/** バックアップに含める表（この順で復元する） */
export const BACKUP_TABLES = ['views', 'cards', 'reviews', 'threads', 'chats', 'extras', 'rootLessons'] as const
export type BackupTable = (typeof BACKUP_TABLES)[number]

export const TABLE_LABEL: Record<BackupTable, string> = {
  views: '表示履歴',
  cards: '学習カード',
  reviews: '復習ログ',
  threads: 'AI チャット',
  chats: 'チャットのメッセージ',
  extras: '追加の解説',
  rootLessons: '語根レッスン',
}

export interface BackupFile {
  app: typeof BACKUP_APP
  schemaVersion: number
  exportedAt: number
  data: Partial<Record<BackupTable, unknown[]>>
  settings?: Partial<Settings>
}

export interface ParsedBackup {
  exportedAt?: number
  rows: Record<BackupTable, Record<string, unknown>[]>
  settings: Partial<Settings>
  /** 形式が合わず取り込まない行の数 */
  skipped: number
  /** バックアップに含まれている表（含まれていない表は、置き換えでも今のデータのまま残す） */
  present: BackupTable[]
}

type Row = Record<string, unknown>
const isObj = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 2000
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isNumOrNull = (v: unknown) => v === null || isNum(v)
const optNum = (v: unknown) => v === undefined || isNum(v)
const optStr = (v: unknown) => v === undefined || typeof v === 'string'
/** 0 以上の整数（回数など） */
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e9
/** JavaScript の Date として有効な時刻（ミリ秒） */
const isTime = (v: unknown) => isNum(v) && Math.abs(v) <= 8.64e15

/** 自動採番の表（id は数値。マージ時は id を付け直す） */
const AUTO_ID: Partial<Record<BackupTable, true>> = { views: true, reviews: true, chats: true }

/** 各表の行を検証して、保存してよい形に整える。不正なら null */
const CLEAN: Record<BackupTable, (r: Row) => Row | null> = {
  views: (r) => (isStr(r.entryId) && isNum(r.viewedAt) && optStr(r.source) ? pick(r, ['id', 'entryId', 'viewedAt', 'source']) : null),
  cards: (r) => {
    // FSRS の状態として成り立つ値だけを受け付ける（小数の状態や不正な日付が入ると、学習画面で例外になるため。レビュー B01）
    const nums = ['due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'learning_steps', 'reps', 'lapses', 'addedAt']
    if (!isStr(r.entryId) || !nums.every((k) => isNum(r[k])) || !isNumOrNull(r.last_review ?? null)) return null
    if (![0, 1, 2, 3].includes(r.state as number)) return null
    if (!['reps', 'lapses', 'learning_steps', 'elapsed_days'].every((k) => isCount(r[k]))) return null
    // FSRS-7 は日数に小数を使う
    if ((r.scheduled_days as number) < 0 || (r.scheduled_days as number) > 1e6 || (r.model !== 7 && !isCount(r.scheduled_days))) return null
    if (!isTime(r.due) || !isTime(r.addedAt) || (r.last_review != null && !isTime(r.last_review))) return null
    if ((r.stability as number) < 0 || (r.stability as number) > 1e6 || (r.difficulty as number) < 0 || (r.difficulty as number) > 10) return null
    if (r.suspended !== undefined && r.suspended !== 0 && r.suspended !== 1) return null
    // FSRS-7 のカードは速い記憶の成分も揃っていること（揃っていなければ取り込まない。FSRS-6 と取り違えないように）
    if (r.model !== undefined && r.model !== 7) return null
    if (r.model === 7 && !(isNum(r.stabilityFast) && (r.stabilityFast as number) >= 0 && (r.stabilityFast as number) <= 1e6)) return null
    if (!optStr(r.run) || (r.migration !== undefined && r.migration !== 'kept') || !(r.migratedAt === undefined || isTime(r.migratedAt))) return null
    const out = pick(r, ['entryId', ...nums, 'state', 'last_review', 'suspended', 'run', 'migration', 'migratedAt'])
    if (r.model === 7) Object.assign(out, { model: 7, stabilityFast: r.stabilityFast })
    return out
  },
  reviews: (r) =>
    isStr(r.entryId) && isNum(r.rating) && r.rating >= 1 && r.rating <= 4 && isNum(r.state) && isNum(r.reviewedAt) && optNum(r.durationMs) && optStr(r.mode) && optNum(r.stability) && optNum(r.difficulty) &&
    (r.model === undefined || r.model === 6 || r.model === 7) && (r.recall === undefined || (isNum(r.recall) && r.recall >= 0 && r.recall <= 1)) && optStr(r.run) && optStr(r.uid)
      ? pick(r, ['id', 'entryId', 'rating', 'state', 'reviewedAt', 'durationMs', 'mode', 'stability', 'difficulty', 'model', 'recall', 'run', 'uid'])
      : null,
  threads: (r) =>
    isStr(r.id) && typeof r.title === 'string' && isNum(r.createdAt) && isNum(r.updatedAt) && optStr(r.about) && (r.pinned === undefined || typeof r.pinned === 'boolean')
      ? pick(r, ['id', 'title', 'about', 'createdAt', 'updatedAt', 'pinned'])
      : null,
  chats: (r) => {
    if (!isStr(r.thread) || (r.role !== 'user' && r.role !== 'assistant') || typeof r.content !== 'string' || !isNum(r.createdAt) || !optStr(r.model)) return null
    const out = pick(r, ['id', 'thread', 'role', 'content', 'createdAt', 'model'])
    if (Array.isArray(r.tools)) out.tools = r.tools.filter((t) => typeof t === 'string')
    if (isObj(r.usage) && isNum(r.usage.input) && isNum(r.usage.output)) out.usage = { input: r.usage.input, output: r.usage.output }
    // 途中で終わった回答の印も復元する（消えると、復元後に注意なしで表示されてしまう。レビュー B06）
    if (r.incomplete === 'length' || r.incomplete === 'filtered' || r.incomplete === 'interrupted') out.incomplete = r.incomplete
    return out
  },
  rootLessons: (r) =>
    isStr(r.id) && r.id.length <= 64 && isTime(r.completedAt) && isCount(r.correct) && isCount(r.total) && isCount(r.best) && isCount(r.plays) && (r.correct as number) <= (r.total as number)
      ? pick(r, ['id', 'completedAt', 'correct', 'total', 'best', 'plays'])
      : null,
  extras: (r) => {
    if (!isStr(r.id) || !isStr(r.entryId) || typeof r.title !== 'string' || (r.source !== 'api' && r.source !== 'external') || !isNum(r.order) || !isNum(r.createdAt) || !optStr(r.model)) return null
    const fields = sanitizeExtra(r)
    return fields ? { ...pick(r, ['id', 'entryId', 'title', 'source', 'model', 'order', 'createdAt']), ...fields } : null
  },
}

function pick(r: Row, keys: string[]): Row {
  const out: Row = {}
  for (const k of keys) if (r[k] !== undefined) out[k] = r[k]
  if ('id' in out && typeof out.id !== 'number' && typeof out.id !== 'string') delete out.id
  return out
}

/** 設定は既定値と同じ型で、値域に収まるものだけ受け付ける */
export function cleanSettings(x: unknown): Partial<Settings> {
  if (!isObj(x)) return {}
  const out: Partial<Settings> = {}
  const inRange = (v: unknown, lo: number, hi: number) => isNum(v) && v >= lo && v <= hi
  if (x.theme === 'system' || x.theme === 'light' || x.theme === 'dark') out.theme = x.theme
  if (x.language === defaultSettings.language) out.language = x.language
  if (typeof x.reduceMotion === 'boolean') out.reduceMotion = x.reduceMotion
  if (x.ttsVoiceURI === null || (typeof x.ttsVoiceURI === 'string' && x.ttsVoiceURI.length < 500)) out.ttsVoiceURI = x.ttsVoiceURI
  if (inRange(x.ttsRate, 0.3, 3)) out.ttsRate = x.ttsRate as number
  if (typeof x.autoSpeak === 'boolean') out.autoSpeak = x.autoSpeak
  if (inRange(x.dailyNewLimit, 0, 10000) && Number.isInteger(x.dailyNewLimit)) out.dailyNewLimit = x.dailyNewLimit as number
  if (inRange(x.desiredRetention, 0.5, 0.99)) out.desiredRetention = x.desiredRetention as number
  if (inRange(x.studyStartRank, 1, 1_000_000) && Number.isInteger(x.studyStartRank)) out.studyStartRank = x.studyStartRank as number
  if (Array.isArray(x.studyFormats)) {
    const f = x.studyFormats.filter((v): v is ConcreteFormat => ALL_FORMATS.includes(v as ConcreteFormat))
    if (f.length) out.studyFormats = [...new Set(f)]
  } else if (typeof x.studyFormat === 'string' && ['en2ja', 'ja2en', 'cloze', 'choice', 'speak', 'mix', 'ja2speak'].includes(x.studyFormat)) {
    // 以前のバックアップ（単一選択）
    out.studyFormats = migrateFormat(x.studyFormat)
  }
  if (typeof x.studyAuto === 'boolean') out.studyAuto = x.studyAuto
  if (typeof x.studyFormatsOpen === 'boolean') out.studyFormatsOpen = x.studyFormatsOpen
  if (typeof x.showSensitive === 'boolean') out.showSensitive = x.showSensitive
  if (typeof x.analytics === 'boolean') out.analytics = x.analytics
  if (typeof x.helpUsageOpen === 'boolean') out.helpUsageOpen = x.helpUsageOpen
  if (x.screenshotFormat === 'webp' || x.screenshotFormat === 'png' || x.screenshotFormat === 'jpeg') out.screenshotFormat = x.screenshotFormat
  if (typeof x.screenshotChrome === 'boolean') out.screenshotChrome = x.screenshotChrome
  return out
}

/** 古い形式（v3 までの 1 語 1 件の追加解説）を extras の行に直す */
function enrichmentsToExtras(old: unknown[]): Row[] {
  return old.filter(isObj).map((e) => {
    const r = e as unknown as EnrichmentRecord
    return {
      id: crypto.randomUUID(),
      entryId: r.entryId,
      title: '外部 AI',
      source: 'external',
      mnemonic: r.mnemonic,
      story: r.story,
      note: r.note,
      examples: r.examples,
      order: 1000,
      createdAt: isNum(r.importedAt) ? r.importedAt : Date.now(),
    }
  })
}

/** 読み込んだ JSON を検証する。アプリのバックアップでなければ例外 */
export function parseBackup(json: unknown): ParsedBackup {
  if (!isObj(json) || json.app !== BACKUP_APP || !isObj(json.data)) throw new Error('ニューロン英単語のバックアップファイルではありません')
  const ver = json.schemaVersion ?? 1
  if (!isNum(ver) || ver > BACKUP_SCHEMA) throw new Error('このバックアップは新しい版のアプリで作られています。アプリを更新してから復元してください')
  const data = json.data as Row
  const rows = Object.fromEntries(BACKUP_TABLES.map((t) => [t, [] as Row[]])) as Record<BackupTable, Row[]>
  let skipped = 0
  // 表があるのに配列でない（壊れている）ときは復元しない。空の配列（本当に 0 件）と区別する（レビュー 2026-11-07 の 02）
  const broken = BACKUP_TABLES.filter((t) => t in data && !Array.isArray(data[t]))
  if (broken.length) throw new Error(`バックアップの「${broken.map((t) => TABLE_LABEL[t]).join('」「')}」の形式が壊れているため、復元できません`)
  const present = BACKUP_TABLES.filter((t) => Array.isArray(data[t]) || (t === 'extras' && Array.isArray(data.enrichments)))
  for (const t of BACKUP_TABLES) {
    let src = Array.isArray(data[t]) ? (data[t] as unknown[]) : []
    if (t === 'extras' && Array.isArray(data.enrichments)) src = [...src, ...enrichmentsToExtras(data.enrichments)]
    for (const r of src) {
      const c = isObj(r) ? CLEAN[t](r) : null
      if (c) rows[t].push(c)
      else skipped++
    }
  }
  // 存在しないスレッドのメッセージは取り込まない
  const threadIds = new Set(rows.threads.map((t) => t.id))
  const before = rows.chats.length
  rows.chats = rows.chats.filter((c) => threadIds.has(c.thread))
  skipped += before - rows.chats.length
  return { exportedAt: isNum(json.exportedAt) ? json.exportedAt : undefined, rows, settings: cleanSettings(json.settings), skipped, present }
}

/** バックアップを作る */
export async function buildBackup(): Promise<BackupFile> {
  const data: BackupFile['data'] = {}
  for (const t of BACKUP_TABLES) data[t] = await db.table(t).toArray()
  const s = useSettings.getState()
  const settings = Object.fromEntries(Object.keys(defaultSettings).map((k) => [k, s[k as keyof Settings]])) as Partial<Settings>
  return { app: BACKUP_APP, schemaVersion: BACKUP_SCHEMA, exportedAt: Date.now(), data, settings }
}

const dedupeKey: Partial<Record<BackupTable, (r: Row) => string>> = {
  views: (r) => `${r.entryId}|${r.viewedAt}`,
  // v2.0 からの回答には ID（uid）がある。同じ時刻の別の回答を取り違えないように、あればそれで見分ける
  reviews: (r) => (typeof r.uid === 'string' ? `u:${r.uid}` : `${r.entryId}|${r.reviewedAt}`),
  chats: (r) => `${r.thread}|${r.role}|${r.createdAt}`,
}

/**
 * 語根レッスンの記録を合わせる（今のデータに追加するとき。レビュー 2026-11-07 の 03）。
 * 最後の結果は新しい方、最高点・挑戦回数は大きい方を残す（同じバックアップを何度追加しても回数が増えないように、足し算はしない）
 */
export function mergeRootLesson(cur: Row, add: Row): Row {
  const newer = (add.completedAt as number) > (cur.completedAt as number) ? add : cur
  return {
    ...newer,
    best: Math.max(cur.best as number, add.best as number),
    plays: Math.max(cur.plays as number, add.plays as number),
  }
}

/**
 * 復元する。
 * - replace: バックアップに含まれている表を空にしてから入れる（端末をバックアップの状態に戻す）。含まれていない表と設定以外はそのまま
 * - merge: 今のデータに追加する。今のデータを古いもので上書きしない
 *   - 履歴・ログ・メッセージは重複を除いて追加
 *   - カードは復習が新しい方、チャットは更新が新しい方を残し、追加の解説は同じものがなければ追加
 *   - 語根レッスンは最後の結果は新しい方、最高点・回数は大きい方
 *   - 設定は変えない
 */
export async function restoreBackup(b: ParsedBackup, mode: 'replace' | 'merge') {
  const tables = BACKUP_TABLES.map((t) => db.table(t))
  await db.transaction('rw', tables, async () => {
    for (const t of BACKUP_TABLES) {
      const table = db.table(t)
      let rows = b.rows[t]
      if (mode === 'replace') {
        if (!b.present.includes(t)) continue
        await table.clear()
      } else if (AUTO_ID[t]) {
        const seen = new Set((await table.toArray()).map((r: Row) => dedupeKey[t]!(r)))
        rows = rows.filter((r) => !seen.has(dedupeKey[t]!(r))).map(({ id: _id, ...r }) => r)
      } else if (t === 'cards') {
        const cur = new Map((await table.toArray()).map((c: Row) => [c.entryId, c]))
        rows = rows.filter((r) => {
          const c = cur.get(r.entryId)
          return !c || ((r.last_review as number | null) ?? 0) > ((c.last_review as number | null) ?? 0)
        })
      } else if (t === 'rootLessons') {
        const cur = new Map((await table.toArray()).map((c: Row) => [c.id, c]))
        rows = rows.map((r) => (cur.has(r.id) ? mergeRootLesson(cur.get(r.id)!, r) : r))
      } else if (t === 'threads') {
        const cur = new Map((await table.toArray()).map((c: Row) => [c.id, c]))
        rows = rows.filter((r) => !cur.has(r.id) || (r.updatedAt as number) > (cur.get(r.id)!.updatedAt as number))
      } else if (t === 'extras') {
        const cur = new Set((await table.toArray()).map((c: Row) => c.id))
        rows = rows.filter((r) => !cur.has(r.id))
      }
      if (rows.length) await table.bulkPut(rows)
    }
  })
  if (mode === 'replace' && Object.keys(b.settings).length) useSettings.setState(b.settings)
}

/** 今の端末の各表の件数（復元前に「今 → 復元後」を見せるため） */
export async function currentCounts(): Promise<Record<BackupTable, number>> {
  const out = {} as Record<BackupTable, number>
  for (const t of BACKUP_TABLES) out[t] = await db.table(t).count()
  return out
}

/** アプリが保存したものをすべて消す（他のサイトのデータに触れないよう、自分のキーだけを消す。B09） */
export async function clearEverything() {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
  for (const store of [localStorage, sessionStorage]) {
    for (const k of Object.keys(store)) if (k.startsWith('nev-')) store.removeItem(k)
  }
}
