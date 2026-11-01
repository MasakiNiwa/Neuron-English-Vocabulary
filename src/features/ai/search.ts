export interface AiSearch {
  /** 話題にする見出し語 */
  about?: string
  /** 自動送信する質問 */
  q?: string
}
export function validateAiSearch(s: Record<string, unknown>): AiSearch {
  return {
    about: typeof s.about === 'string' && s.about ? s.about : undefined,
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
  }
}
