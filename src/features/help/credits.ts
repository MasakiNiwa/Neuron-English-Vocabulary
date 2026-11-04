/** 単語データ・コンテンツの出典（ライブラリはビルド時に自動収集） */
export interface DataSource {
  name: string
  url: string
  license: string
  licenseUrl: string
  usage: string
}

export const dataSources: DataSource[] = [
  {
    name: 'New General Service List (NGSL) 1.2',
    url: 'https://www.newgeneralservicelist.com/',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    usage: '頻出語リスト・頻度順位 (Browne, C., Culligan, B. & Phillips, J.)',
  },
  {
    name: 'TOEIC Service List (TSL) 1.2',
    url: 'https://www.newgeneralservicelist.com/toeic-service-list',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    usage: 'TOEIC で特に多い語と、TOEIC のレベルの目安の推定 (Browne, C. & Culligan, B.)',
  },
  {
    name: 'wordfreq',
    url: 'https://github.com/rspeer/wordfreq',
    license: 'CC BY-SA 4.0 (data) / Apache-2.0 (code)',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    usage: '単語の出現頻度 (Robyn Speer)',
  },
  {
    name: 'Wiktionary（Wiktextract / kaikki.org 経由）',
    url: 'https://en.wiktionary.org/',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    usage: '品詞・発音記号・語源の構造・訳語・関連語 (Wiktionary contributors / Tatu Ylonen)',
  },
  {
    name: 'JMdict',
    url: 'https://www.edrdg.org/jmdict/j_jmdict.html',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    usage: '日本語訳の補完（Electronic Dictionary Research and Development Group）',
  },
  {
    name: 'Tatoeba',
    url: 'https://tatoeba.org/',
    license: 'CC BY 2.0 FR',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/fr/',
    usage: '英日対訳の例文 (Tatoeba contributors)',
  },
]
