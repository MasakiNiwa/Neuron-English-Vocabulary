import type { Entry } from '@/features/dictionary/types'
import type { Attempt } from './AnswerMemo'
import { FORMAT_LABEL, type ConcreteFormat } from './formatDefs'

const QUESTION: Record<ConcreteFormat, string> = {
  en2ja: '英単語を見て意味を答える',
  choice: '英単語を見て、4 つの選択肢から意味を選ぶ',
  listen: '発音を聞いて意味を答える',
  ja2en: '日本語の意味を見て英単語を答える',
  cloze: '例文の空欄に入る英単語を答える',
  dictation: '発音を聞いて英単語の綴りを書く',
  speak: '英単語を見て発音する',
}

const VERDICT: Record<string, string> = { correct: '正解', form: '単語は合っているが形が違う', close: '綴りがおしい', wrong: '不正解' }

/**
 * 学習カードの答え合わせについて AI にアドバイスを頼む文。
 * 問題・正解・自分の答え（メモ・書いた答え・話した答え・選んだ答え）をまとめる
 */
export function buildAdvicePrompt(o: { head: string; format: ConcreteFormat; entry: Entry; attempt: Attempt; answer?: string; sentence?: string }) {
  const { head, format, entry, attempt } = o
  const meanings = entry.g.map((g) => g.ja.slice(0, 4).join('、')).join(' / ')
  const lines = [
    '学習カードの答え合わせについて、アドバイスをください。',
    '',
    `- 単語: ${head}`,
    `- 出題形式: ${FORMAT_LABEL[format]}（${QUESTION[format]}）`,
  ]
  if (o.sentence) lines.push(`- 例文: ${o.sentence}`)
  lines.push(`- 正解: ${o.answer && o.answer !== head ? `${o.answer}（${head}）` : head} ＝ ${meanings}`)
  const mine: string[] = []
  if (attempt.typed) mine.push(`書いた答え「${attempt.typed.input.trim() || '（空欄）'}」（アプリの判定: ${VERDICT[attempt.typed.verdict]}）`)
  if (attempt.spoken) mine.push(`話した答え（聞き取り）「${attempt.spoken.heard || '（聞き取れず）'}」（発音の点数 ${attempt.spoken.score} / 100）`)
  if (attempt.choice) mine.push(`選んだ答え「${attempt.choice.text}」（${attempt.choice.correct ? '正解' : '不正解'}）`)
  if (attempt.memo.trim()) mine.push(`メモ「${attempt.memo.trim()}」`)
  if (attempt.hints) mine.push(`ヒントを ${attempt.hints} 段階使った`)
  lines.push(`- 私の回答: ${mine.length ? mine.join(' / ') : '答えを入力せずに答えを見た'}`)
  lines.push(
    '',
    '次のことを短く教えてください。',
    '1. 私の回答のどこが合っていて、どこが違うか（言い換えとして正しい場合はそう言ってください）',
    '2. 語源（語根・接頭辞・接尾辞）を使った覚え方のコツ',
    '3. 間違えやすい似た語や、使い分けの注意があれば',
  )
  return lines.join('\n')
}
