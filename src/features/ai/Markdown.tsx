import { Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { LinkedText } from '@/features/dictionary/components/links'

/** 子要素の文字列部分だけ、辞書にある英単語をリンク化する */
function linkify(children: ReactNode): ReactNode {
  return Children.map(children, (c) => (typeof c === 'string' ? <LinkedText text={c} /> : isValidElement(c) ? c : c))
}

const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{linkify(children)}</p>,
  li: ({ children }) => <li className="my-0.5">{linkify(children)}</li>,
  strong: ({ children }) => <strong className="font-semibold">{linkify(children)}</strong>,
  em: ({ children }) => <em>{linkify(children)}</em>,
  td: ({ children }) => <td className="border border-border px-2 py-1">{linkify(children)}</td>,
  th: ({ children }) => <th className="border border-border bg-surface-2 px-2 py-1 text-left font-semibold">{linkify(children)}</th>,
  h1: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold">{linkify(children)}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold">{linkify(children)}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-3 font-semibold">{linkify(children)}</h4>,
  h4: ({ children }) => <h4 className="mb-1 mt-3 font-semibold">{linkify(children)}</h4>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-accent/50 pl-3 text-muted">{children}</blockquote>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-sm">{children}</table>
    </div>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
    ),
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-xs">{children}</pre>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">
      {children}
    </a>
  ),
  hr: () => <hr className="my-3 border-border" />,
}

export function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  )
}
