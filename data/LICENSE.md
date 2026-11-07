# 単語データのライセンス

`data/` および `public/data/` 以下の単語データは
**Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)** で提供します。
https://creativecommons.org/licenses/by-sa/4.0/

ソースコード（`src/`、`scripts/` など）は、リポジトリ直下の [LICENSE](../LICENSE)（MIT）に従います。

## 出典

| データ | 出典 | ライセンス | 用途 |
|---|---|---|---|
| New General Service List (NGSL) 1.2 | Browne, C., Culligan, B. & Phillips, J. — https://www.newgeneralservicelist.com/ | CC BY-SA 4.0 | 頻出語リスト、見出し語と活用形の対応 |
| TOEIC Service List (TSL) 1.2 | Browne, C. & Culligan, B. — https://www.newgeneralservicelist.com/toeic-service-list | CC BY-SA 4.0 | TOEIC で特に多い語、TOEIC のレベルの目安の推定 |
| wordfreq | Robyn Speer — https://github.com/rspeer/wordfreq | CC BY-SA 4.0（データ） | 単語の頻度順位 |
| Wiktionary | Wiktionary contributors — https://en.wiktionary.org/ （Wiktextract / kaikki.org 経由、Tatu Ylonen） | CC BY-SA 4.0 | 品詞、発音記号、英語の定義、語源、訳語（日・韓・中）、類義語・反義語・派生語、熟語 |
| JMdict | Electronic Dictionary Research and Development Group — https://www.edrdg.org/jmdict/j_jmdict.html | CC BY-SA 4.0 | Wiktionary に日本語訳がない語の訳語の補完（逆引き） |
| Tatoeba | Tatoeba contributors — https://tatoeba.org/ | CC BY 2.0 FR | 英日対訳の例文（各例文に Tatoeba の文 ID を保持） |
| オリジナル例文（`data/examples_original.tsv`） | このリポジトリのオリジナル | CC BY-SA 4.0 | Tatoeba に適切な例文がない語の英日対訳の例文 |
| 語根・接辞辞書（`data/roots.tsv`, `data/affixes.tsv`） | このリポジトリのオリジナル | CC BY-SA 4.0 | 語根・接頭辞・接尾辞の意味と由来 |
| 語源の成り立ち・印欧祖語辞書・手動修正（`data/morpheme_parts.tsv`, `data/pie_roots.tsv`, `data/overrides.tsv`） | このリポジトリのオリジナル | CC BY-SA 4.0 | 語源の語源分解、祖語ファミリー、訳語・分解の修正 |

上記を機械的に加工（抽出・統合・語源の分解）したものであり、誤りが含まれる可能性があります。

## 再生成

`scripts/data/README.md` を参照してください。
