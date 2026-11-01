# 単語データ生成スクリプト

`public/data/` の単語データは以下の手順で生成します（生データはリポジトリに含めません）。

```bash
pip install wordfreq
RAW=./data-raw; WORK=./data-raw/work; mkdir -p $RAW $WORK
cd $RAW
curl -O https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz
curl -O https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2
curl -O https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences.tsv.bz2
curl -O https://downloads.tatoeba.org/exports/links.tar.bz2
curl -O http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz
curl -LO https://www.newgeneralservicelist.com/s/NGSL_12_stats.csv
curl -LO https://www.newgeneralservicelist.com/s/NGSL_12_lemmatized_for_research.csv
cd -

python3 scripts/data/01_filter_wiktionary.py $RAW/kaikki.org-dictionary-English.jsonl.gz $WORK/wikt.jsonl
python3 scripts/data/02_tatoeba_pairs.py $RAW/eng_sentences.tsv.bz2 $RAW/jpn_sentences.tsv.bz2 $RAW/links.tar.bz2 $WORK/pairs.tsv $WORK/eng_all.txt
python3 scripts/data/03_jmdict_reverse.py $RAW/JMdict_e.gz $WORK/jm_rev.json
python3 scripts/data/04_build.py --work $WORK --raw $RAW --repo .
```

| スクリプト | 内容 |
|---|---|
| 01_filter_wiktionary.py | Wiktionary ダンプから対象語のエントリだけを抽出・軽量化 |
| 02_tatoeba_pairs.py | Tatoeba の英日対訳ペアを抽出 |
| 03_jmdict_reverse.py | JMdict を逆引きし、英語 → 日本語訳の補完表を作成 |
| 04_build.py | 見出し語の選定（頻度順）、訳語、語源分解（`data/roots.tsv` / `data/affixes.tsv`）、例文、関連語を統合して出力 |

## 出力形式（public/data）

- `index.json` — 全見出し語の索引 `[key, 種別(0=単語/1=熟語), 順位, 短い訳, 品詞[], shard, 形態素ID[]]`
- `entries/<shard>.json` — 詳細データ（200 語ごとに分割。w=単語, p=熟語）
- `morphemes.json` — 語根・接頭辞・接尾辞と、それを含む見出し語
- `meta.json` — 生成日時・件数

スキーマの型定義は `src/features/dictionary/types.ts` を参照。

## 手で編集するデータ（data/）

| ファイル | 内容 |
|---|---|
| roots.tsv / affixes.tsv | 語根・接頭辞・接尾辞の辞書（綴り・語源判定キー・意味・由来） |
| morpheme_parts.tsv | **語源の語源分解**: 語根自体が小さな語源からできている場合の成り立ち（例: `r:jud	r:jus+r:dict`）。追記するだけで分解が増える |
| pie_roots.tsv | 印欧祖語の語根（Wiktionary の `{{root|en|ine-pro|...}}` と照合）と、そこから生まれた語根 |
| overrides.tsv | 頻出語から順に直していく手動修正（訳語の置き換え `gloss`、語源分解の誤判定の除外 `exclude`、見出し語から外す `drop`） |
| explanations/*.tsv | 書き下ろしの解説（語根の意味から単語の意味が生まれる理由）。番号付きファイルで少しずつ追加する |

## コンテンツ拡充の進め方

1. `python3 scripts/data/05_quality_report.py --top 3000` で怪しい訳語を頻度順に洗い出す
2. `data/overrides.tsv` に修正を追記、`data/explanations/` に解説を追記
3. `04_build.py` で再生成し、PR を作成する

