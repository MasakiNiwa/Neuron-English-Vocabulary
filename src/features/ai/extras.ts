import { db, type ExtraNote } from '@/lib/db'

/**
 * 単語ページの「追加の解説」（1 語に複数。タブで切り替える）。
 * 外部 AI からの取り込みと、アプリ内の AI での作成の両方で使う。
 * どちらも AI の出力なので、保存する前に必ず sanitizeExtra で形と長さを確かめる。
 */

export type ExtraFields = Pick<ExtraNote, 'mnemonic' | 'story' | 'note' | 'examples'>

const LIMITS = { mnemonic: 400, story: 2000, note: 800, example: 300, examples: 6 }

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t ? t.slice(0, max) : undefined
}

/** AI の出力（型が保証されない）を、表示できる形だけ取り出す。中身が何もなければ null */
export function sanitizeExtra(x: unknown): ExtraFields | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const examples = Array.isArray(o.examples)
    ? o.examples
        .map((e) => {
          if (!e || typeof e !== 'object') return null
          const r = e as Record<string, unknown>
          const en = str(r.en, LIMITS.example)
          const ja = str(r.ja, LIMITS.example)
          return en ? { en, ja: ja ?? '' } : null
        })
        .filter((e): e is { en: string; ja: string } => !!e)
        .slice(0, LIMITS.examples)
    : []
  const out: ExtraFields = {
    mnemonic: str(o.mnemonic, LIMITS.mnemonic),
    story: str(o.story, LIMITS.story),
    note: str(o.note, LIMITS.note),
    examples: examples.length ? examples : undefined,
  }
  return out.mnemonic || out.story || out.note || out.examples ? out : null
}

/** 追加解説を末尾（右端のタブ）に追加する */
export async function addExtra(entryId: string, fields: ExtraFields, meta: { title: string; source: ExtraNote['source']; model?: string }) {
  const last = await db.extras.where('[entryId+order]').between([entryId, -Infinity], [entryId, Infinity]).last()
  const rec: ExtraNote = {
    id: crypto.randomUUID(),
    entryId,
    ...fields,
    ...meta,
    order: (last?.order ?? -1) + 1,
    createdAt: Date.now(),
  }
  await db.extras.add(rec)
  return rec
}

export async function removeExtra(id: string) {
  await db.extras.delete(id)
}

/** タブを左右に動かす（dir = -1: 左へ / 1: 右へ） */
export async function moveExtra(entryId: string, id: string, dir: -1 | 1) {
  await db.transaction('rw', db.extras, async () => {
    const list = await db.extras.where('[entryId+order]').between([entryId, -Infinity], [entryId, Infinity]).toArray()
    const i = list.findIndex((x) => x.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    await Promise.all(list.map((x, n) => db.extras.update(x.id, { order: n })))
  })
}

/** AI の応答から JSON オブジェクト（または配列）を取り出す。コードブロックや前後の文章があっても読む */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  const starts = [t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0)
  if (!starts.length) throw new Error('JSON が見つかりませんでした')
  const s = Math.min(...starts)
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'))
  return JSON.parse(t.slice(s, end + 1))
}

/** アプリ内の AI に追加解説を作ってもらうときの指示 */
export function extraPrompt(word: string) {
  return `英単語「${word}」について、このアプリの「追加の解説」に載せる文章を書いてください。
一度に大量に作るのではなく、この 1 語のためだけに時間をかけて書く解説です。辞書の短い説明では伝えきれない、読んで「なるほど、面白い」と思える充実した内容にしてください。

- まず get_word でアプリの辞書（意味・語源・語源分解・既存の解説）を確認し、内容が重ならないように深めてください。
- 語源は確かな説を中心に書き、諸説あるものは「〜とされる」「諸説ある」と明記してください。作り話はしないでください。
- 日本人学習者の目線で、意味のつながり（語根 → 元の意味 → 今の意味）が腹落ちするように書いてください。

出力は次の JSON オブジェクトのみとし、前後に説明文を付けないでください（コードブロック記号もなし）。
{
  "mnemonic": "語源・語根や似た単語とのつながりを使った覚え方（100〜200字）",
  "story": "語源の由来と、意味がどう変わって今の意味になったかの物語。関連する単語やちょっとした豆知識も交えて（400〜800字）",
  "note": "使い分け・よく使う組み合わせ（コロケーション）・間違えやすい点（100〜250字）",
  "examples": [{ "en": "自然な例文", "ja": "その和訳" }, { "en": "...", "ja": "..." }, { "en": "...", "ja": "..." }]
}`
}
