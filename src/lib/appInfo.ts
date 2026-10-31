/** アプリのメタ情報（ビルド時に埋め込まれる） */
export const appInfo = {
  name: 'ニューロン英単語',
  nameEn: 'Neuron English Vocabulary',
  version: __APP_VERSION__,
  buildDate: __BUILD_DATE__,
  commit: __GIT_COMMIT__,
  repository: 'https://github.com/MasakiNiwa/Neuron-English-Vocabulary',
  license: 'MIT',
} as const

/** データファイルの URL（base: './' に合わせて相対解決） */
export function assetUrl(path: string): string {
  return new URL(path.replace(/^\//, ''), document.baseURI).toString()
}
