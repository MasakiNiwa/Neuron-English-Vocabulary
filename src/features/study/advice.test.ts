import { describe, expect, it } from 'vitest'
import type { Entry } from '@/features/dictionary/types'
import { buildAdvicePrompt } from './advice'

const entry = { k: 'construct', h: 'construct', g: [{ ja: ['建設する', '組み立てる'] }] } as unknown as Entry

describe('AI のアドバイスを頼む文', () => {
  it('問題・正解・自分の答え（メモ・書いた答え・ヒント）をまとめる', () => {
    const p = buildAdvicePrompt({
      head: 'construct',
      format: 'ja2en',
      entry,
      attempt: { memo: 'struct は築く？', typed: { input: 'constract', verdict: 'close' }, hints: 1 },
    })
    expect(p).toContain('単語: construct')
    expect(p).toContain('日→英')
    expect(p).toContain('建設する、組み立てる')
    expect(p).toContain('書いた答え「constract」（アプリの判定: 綴りがおしい）')
    expect(p).toContain('メモ「struct は築く？」')
    expect(p).toContain('ヒントを 1 段階使った')
  })
  it('答えを入力しなかったときはそう伝え、穴埋めは例文と形を添える', () => {
    const p = buildAdvicePrompt({ head: 'construct', format: 'cloze', entry, attempt: { memo: ' ' }, answer: 'constructed', sentence: 'They constructed a bridge.' })
    expect(p).toContain('答えを入力せずに答えを見た')
    expect(p).toContain('例文: They constructed a bridge.')
    expect(p).toContain('正解: constructed（construct）')
  })
})
