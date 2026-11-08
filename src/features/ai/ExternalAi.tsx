import { Check, ClipboardCopy, Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { db } from '@/lib/db'
import { loadDictionary } from '@/features/dictionary/data'
import { addExtra, extractJson, sanitizeExtra } from './extras'

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
        ふだんお使いの AI（ChatGPT・Gemini・Claude など）で、指定した単語にまとめて解説を付けられる機能です。① 単語を入力してプロンプトをコピーし、お使いの AI に貼り付けます。② 返ってきた JSON を下に貼り付けて取り込むと、単語ページの「追加の解説」にタブとして追加されます。API キーは不要です。
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
            const { hidden } = await loadDictionary()
            const recent = (await db.views.orderBy('viewedAt').reverse().limit(60).toArray()).filter((v) => !hidden.has(v.entryId))
            setWords([...new Set(recent.map((v) => v.entryId.replace(/_/g, ' ')))].slice(0, 15).join(', '))
          }}
        >
          最近見た単語を入れる
        </Button>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">② AI の出力（JSON）を貼り付け</span>
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
              const parsed = extractJson(json)
              const arr: unknown[] = Array.isArray(parsed) ? parsed : [parsed]
              let added = 0
              let missing = 0
              let invalid = 0
              for (const x of arr) {
                const word = x && typeof x === 'object' && typeof (x as { word?: unknown }).word === 'string' ? (x as { word: string }).word : ''
                const key = word ? dict.byLower.get(word.toLowerCase().trim()) : undefined
                if (!key) {
                  missing++
                  continue
                }
                const fields = sanitizeExtra(x)
                if (!fields) {
                  invalid++
                  continue
                }
                await addExtra(key, fields, { title: '外部 AI', source: 'external' })
                added++
              }
              setResult(
                `${added} 語の解説を取り込みました` +
                  (missing ? `（${missing} 件は辞書に見つかりませんでした）` : '') +
                  (invalid ? `（${invalid} 件は形式が正しくないため取り込みませんでした）` : ''),
              )
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
