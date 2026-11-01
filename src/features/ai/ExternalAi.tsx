import { Check, ClipboardCopy, Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { db } from '@/lib/db'
import { loadDictionary } from '@/features/dictionary/data'

/**
 * 外部 AI 連携: アプリがプロンプトを作り、ユーザーが好きな AI（ChatGPT / Gemini / Claude など）に貼り付けて
 * 生成された JSON をアプリに取り込む。API キーがなくても使える。
 */
function buildPrompt(words: string[]) {
  return `あなたは英語の語源に詳しい日本語の英語教師です。次の英単語・熟語それぞれについて、日本人学習者向けの学習データを作成してください。

単語: ${words.join(', ')}

出力は次の形式の JSON 配列のみとし、説明文やコードブロック記号は付けないでください。
[
  {
    "word": "見出し語（入力どおり）",
    "mnemonic": "語源（語根・接頭辞・接尾辞）を使った覚え方。60字以内",
    "story": "語源の由来や意味の変化を物語風に。150字以内",
    "examples": [{ "en": "自然で短い例文", "ja": "その和訳" }, { "en": "...", "ja": "..." }],
    "note": "使い分け・コロケーション・注意点。80字以内"
  }
]`
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = t.indexOf('[')
  return JSON.parse(start >= 0 ? t.slice(start, t.lastIndexOf(']') + 1) : t)
}

export function ExternalAi({ defaultWords = '' }: { defaultWords?: string }) {
  const [words, setWords] = useState(defaultWords)
  const [copied, setCopied] = useState(false)
  const [json, setJson] = useState('')
  const [result, setResult] = useState('')
  const list = words
    .split(/[,\n、]/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 30)
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs leading-relaxed text-muted">
        アプリ内の AI では重い処理を、外部の AI サービスに任せる機能です。① プロンプトをコピーして外部 AI に貼り付け、② 返ってきた JSON を下に貼り付けて取り込むと、単語ページに「追加の解説」として表示されます。API キーは不要です。
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">対象の単語（カンマ・改行区切り、最大30語）</span>
        <textarea className="min-h-16 rounded-xl border border-border bg-surface p-2 font-mono text-sm outline-none focus:border-accent" value={words} onChange={(e) => setWords(e.target.value)} placeholder="construct, inspect, give up" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!list.length}
          onClick={async () => {
            await navigator.clipboard.writeText(buildPrompt(list))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} ① プロンプトをコピー
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            const recent = await db.views.orderBy('viewedAt').reverse().limit(60).toArray()
            setWords([...new Set(recent.map((v) => v.entryId.replace(/_/g, ' ')))].slice(0, 15).join(', '))
          }}
        >
          最近見た単語を入れる
        </Button>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">② 外部 AI の出力（JSON）を貼り付け</span>
        <textarea className="min-h-24 rounded-xl border border-border bg-surface p-2 font-mono text-xs outline-none focus:border-accent" value={json} onChange={(e) => setJson(e.target.value)} />
      </label>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!json.trim()}
          onClick={async () => {
            try {
              const dict = await loadDictionary()
              const arr = parseJson(json) as { word: string; mnemonic?: string; story?: string; note?: string; examples?: { en: string; ja: string }[] }[]
              const rows = arr
                .map((x) => ({ key: dict.byLower.get(String(x.word).toLowerCase().trim()), x }))
                .filter((r) => r.key)
                .map(({ key, x }) => ({
                  entryId: key!,
                  mnemonic: x.mnemonic,
                  story: x.story,
                  note: x.note,
                  examples: Array.isArray(x.examples) ? x.examples.slice(0, 5) : undefined,
                  source: 'external',
                  importedAt: Date.now(),
                }))
              await db.enrichments.bulkPut(rows)
              setResult(`${rows.length} 語の解説を取り込みました（${arr.length - rows.length} 語は辞書に見つかりませんでした）`)
              setJson('')
            } catch (e) {
              setResult(`読み込めませんでした: ${String(e)}`)
            }
          }}
        >
          <Download className="size-4" /> 取り込む
        </Button>
        {result && <span className="text-xs text-muted">{result}</span>}
      </div>
    </div>
  )
}
