import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sparkles } from 'lucide-react'
import { db } from '@/lib/db'
import { LinkedText } from '@/features/dictionary/components/links'

const QUICK = [
  { label: '語源を物語で', q: 'この単語の語源を、成り立ちから意味が生まれるまでの物語として教えて' },
  { label: '覚え方を提案', q: 'この単語の覚え方を、語根や似た単語とのつながりを使って提案して' },
  { label: '使い分け', q: 'この単語と似た意味の単語との使い分けを教えて' },
  { label: '例文をもっと', q: 'この単語を使った自然な例文を、場面別に3つ作って' },
]

/** 単語ページの「AI に聞く」と、取り込んだ追加解説 */
export function WordAiPanel({ entryKey }: { entryKey: string }) {
  const enr = useLiveQuery(() => db.enrichments.get(entryKey), [entryKey])
  return (
    <>
      {enr && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted">追加の解説</h2>
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 text-sm leading-relaxed">
            {enr.mnemonic && (
              <p>
                <span className="mr-1 text-xs text-accent">覚え方</span>
                <LinkedText text={enr.mnemonic} />
              </p>
            )}
            {enr.story && (
              <p>
                <span className="mr-1 text-xs text-accent">由来</span>
                <LinkedText text={enr.story} />
              </p>
            )}
            {enr.note && (
              <p>
                <span className="mr-1 text-xs text-accent">メモ</span>
                <LinkedText text={enr.note} />
              </p>
            )}
            {enr.examples?.map((ex, i) => (
              <div key={i} className="rounded-xl bg-surface-2 p-2">
                <p className="font-en">
                  <LinkedText text={ex.en} />
                </p>
                <p className="text-muted">{ex.ja}</p>
              </div>
            ))}
            <p className="text-[10px] text-muted">外部 AI で作成し取り込んだ内容です</p>
          </div>
        </section>
      )}
      <section className="mt-5">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted">
          <Sparkles className="size-4" /> AI に聞く
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((x) => (
            <Link
              key={x.label}
              to="/ai"
              search={{ about: entryKey, q: x.q }}
              className="rounded-full border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent"
            >
              {x.label}
            </Link>
          ))}
          <Link to="/ai" search={{ about: entryKey }} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent">
            自由に質問…
          </Link>
        </div>
      </section>
    </>
  )
}
