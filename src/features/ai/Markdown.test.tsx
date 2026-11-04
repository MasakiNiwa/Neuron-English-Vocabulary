import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'

vi.mock('@/features/dictionary/components/links', () => ({ LinkedText: ({ text }: { text: string }) => text }))

describe('Markdown（AI の回答の表示）', () => {
  it('外部の画像を読み込まない（レビュー S02）', () => {
    const html = renderToStaticMarkup(<Markdown text={'![x](https://audit.invalid/pixel?data=SYNTHETIC)'} />)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('audit.invalid')
    expect(html).toContain('［画像: x］')
  })
  it('javascript: のリンクや生の HTML を実行できる形にしない', () => {
    const html = renderToStaticMarkup(<Markdown text={'[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>'} />)
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('<img src="x"')
  })
})
