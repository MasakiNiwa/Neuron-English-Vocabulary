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
curl -LO https://www.newgeneralservicelist.com/s/TSL_12_stats.csv   # TOEIC Service List（任意。なければ TOEIC 頻出の印なし）
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
- `meta.json` — 生成日時・件数・元データの記録（`sources`: 各ファイルのサイズと SHA-256、Python と wordfreq の版）。同じ元データと `data/` からは同じ出力になるので、ダウンロードし直した元データが同じ版かをこのハッシュで確認できる

スキーマの型定義は `src/features/dictionary/types.ts` を参照。

## 手で編集するデータ（data/）

| ファイル | 内容 |
|---|---|
| roots.tsv / affixes.tsv | 語根・接頭辞・接尾辞の辞書（綴り・語源判定キー・意味・由来） |
| morpheme_parts.tsv | **語源の語源分解**: 語根自体が小さな語源からできている場合の成り立ち（例: `r:jud	r:jus+r:dict`）。追記するだけで分解が増える |
| pie_roots.tsv | 印欧祖語の語根（Wiktionary の `{{root|en|ine-pro|...}}` と照合）と、そこから生まれた語根 |
| overrides/*.tsv | 頻出語から順に直していく手動修正（訳語の置き換え `gloss`、語源分解の誤判定の除外 `exclude`、見出し語から外す `drop`、語源分解をまとめて外す `noparts`、解説で説明できた語の語源分解を手で登録する `parts`） |
| phrases_extra.tsv | Wiktionary に項目がない重要熟語（depend on など）の補い。「熟語・品詞・英語の定義」を書き、訳語は overrides の `gloss` で書く |
| explanations/*.tsv | 書き下ろしの解説（語根の意味から単語の意味が生まれる理由）。番号付きファイルで少しずつ追加する |

## コンテンツ拡充の進め方

1. `python3 scripts/data/05_quality_report.py --top 3000` で怪しい訳語を頻度順に洗い出す
2. `data/overrides/` に今回の弾のファイルを追加して修正を書く、`data/explanations/` に解説を追記
3. `python3 scripts/data/06_lint.py` で書式・形態素 ID の誤りを確認する（CI でも実行）
   - ビルド後に `python3 scripts/data/07_note_parts_report.py` を実行すると、解説で語根の語源語（例: portare）に触れているのに
     語源分解でその語根につながっていない語を頻度順に一覧できる（手動の語源分解を追加する候補探し用）
4. `04_build.py` で再生成し、PR を作成する

### 補足

- 元データに日本語訳がない語・熟語は自動では採用されない。`04_build.py` は採用できなかった語を
  `$WORK/skipped_words.txt`・`$WORK/skipped_phrases.txt` に頻度順で書き出すので、重要なものに `gloss` で訳を書くと採用される
- `gloss` を書いた語・熟語は、`--words`・`--phrases` の上限を超えても採用される
- Wiktionary に項目自体がない熟語は、`data/phrases_extra.tsv` に定義を書いたうえで `gloss` を書く
- 手で書いたデータ（`gloss`・`parts`・解説）がある語は、単語数の上限（`--words`）を超えても残す
- 訳語を手で書いた語は、一覧に出す短い訳も書いた順のまま使う

