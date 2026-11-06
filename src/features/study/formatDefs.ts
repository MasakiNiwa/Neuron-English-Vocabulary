/**
 * 出題形式
 *  意味を答える: en2ja（英語を見て意味を思い出す）・choice（4 択で意味を選ぶ）・listen（発音を聞いて意味を答える）
 *  英語を答える: ja2en（意味 → 英語）・cloze（例文の穴埋め）・dictation（発音を聞いて綴りを書く）。書く / 話す / 答えを見る で答える
 *  発音する: speak（英語を見て発音する）
 * 複数選べ、選んだ中から出題する。「おまかせ」では覚え具合に合わせて選ぶ（新しい語は意味を答える、覚えてきた語は英語を答える）
 */
export type ConcreteFormat = 'en2ja' | 'choice' | 'listen' | 'ja2en' | 'cloze' | 'dictation' | 'speak'
/** 以前の単一選択の値（'mix' を含む）。古い設定の読み込みにだけ使う */
export type StudyFormat = ConcreteFormat | 'mix' | 'ja2speak'

export const ALL_FORMATS: ConcreteFormat[] = ['en2ja', 'choice', 'listen', 'ja2en', 'cloze', 'dictation', 'speak']

export const FORMAT_LABEL: Record<ConcreteFormat, string> = {
  en2ja: '英→日',
  choice: '4択',
  listen: '聞いて意味',
  ja2en: '日→英',
  cloze: '穴埋め',
  dictation: '聞いて書く',
  speak: '発音',
}

/** 意味を答える（見て・聞いて分かるか）形式と、英語を答える（自分で出せるか）形式 */
export const RECOGNITION: ConcreteFormat[] = ['en2ja', 'choice', 'listen']
export const PRODUCTION: ConcreteFormat[] = ['ja2en', 'cloze', 'dictation', 'speak']

/** 以前の単一選択の設定を、複数選択の設定に移す */
export function migrateFormat(old: unknown): ConcreteFormat[] {
  if (old === 'mix') return ['en2ja', 'choice', 'ja2en', 'cloze']
  if (old === 'ja2speak') return ['ja2en']
  return ALL_FORMATS.includes(old as ConcreteFormat) ? [old as ConcreteFormat] : ['en2ja']
}
