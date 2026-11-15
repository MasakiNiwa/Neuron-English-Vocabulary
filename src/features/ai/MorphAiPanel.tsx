import { Link } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import type { Morpheme } from '@/features/dictionary/types'
import { morphAbout } from './about'
import { useAiConfig } from './config'
import { markInternalAsk } from './internalAsk'
import { ModelSelect } from './ModelSelect'

/** 語源（語根・接頭辞・接尾辞・祖語）について AI に聞く。コラムはアプリに入れず、その場で自分の AI に語ってもらう */
const QUICK = [
  { label: 'コラムで語って', q: 'この語源について、数千年前の出発点から今の英単語まで、意外な親戚の単語や雑学も交えて、軽い語り口のコラムとして語って' },
  { label: '覚え方を提案', q: 'この語源の覚え方を、身近なイメージと代表的な単語を使って提案して' },
  { label: '似た語源との違い', q: 'この語源と、似た意味や似た形のほかの語源との違いと見分け方を教えて' },
  { label: '単語を物語でつなぐ', q: 'この語源を含む単語たちが、元の意味からどう枝分かれして今の意味になったのか、物語でつないで' },
]

export function MorphAiPanel({ m }: { m: Morpheme }) {
  const hasKeys = useAiConfig((s) => s.keys.some((k) => k.models.length > 0))
  const about = morphAbout(m.id)
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tracking-wide text-muted">
          <Sparkles className="size-4" /> AI に聞く
        </h2>
        {hasKeys && <ModelSelect className="ml-auto max-w-[60%]" />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((x) => (
          <Link
            key={x.label}
            to="/ai"
            search={{ about, q: x.q }}
            onClick={() => markInternalAsk(about, x.q)}
            className="rounded-full border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent"
          >
            {x.label}
          </Link>
        ))}
        <Link to="/ai" search={{ about }} onClick={() => markInternalAsk(about, undefined)} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent">
          自由に質問…
        </Link>
      </div>
    </section>
  )
}
