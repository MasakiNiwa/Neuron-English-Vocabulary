# 再開監査：照合結果と残作業

対象は `MasakiNiwa/Neuron-English-Vocabulary`、基準は main の `1f65cbefdf0d41eb868533f378a8ed5ea0a4b808`（v0.82.0）。日付は2026-11-03 JST。

**全件の構造検査・台帳再構築を完了。全件の語源正確性の外部辞典による認証は未完了。** このブランチはClaudeに渡す監査結果・根拠・修正案を保存する。公開JSON、編集用TSV、生成器、アプリ本体は変更していない。

## 添付資料との照合

添付原本は [UPLOADED_REPORT.md](UPLOADED_REPORT.md)。添付資料の手順は引継ぎ情報であり、実行済みの証拠とは扱っていない。

| 添付の記載 | 今回確認できた状態 |
|---|---|
| 旧ブランチに300項目の修正を反映 | `review/full-etymology-audit-2026-11-03` は基準mainと同じSHA。差分は回収できない |
| corrections.json / all-entries.tsv / CLAUDE_HANDOFF.md | 現リポジトリに存在しない。今回、別ディレクトリに新たに再構築 |
| overrides/063.tsv・解説10件・公開JSON更新 | 未反映。今回もレビュー前に自動適用はしていない |
| version `20261103-audit1` | 実際は `20261102` |
| 全13,216項目（単語11,887・句1,329） | 現データと一致 |
| 全231語根・単語語基1,794組 | 現データから再計算して一致 |
| #84の6項目を維持 | number / remember / inflation / religion / former / track はmainから変更なし |
| 残る優先候補1,131件等 | 旧検査コード・差分がないため再現不可。今回の規則と件数を別に保存 |

参照会話 `6ae90477-9194-83e8-97b9-aa9ce17aa525` を読むツールはこのセッションでは提供されていなかった。会話全文を読んだとは主張しない。リモートのもう一つの作業ブランチ `ccr-9c0b29b3-4scwwn` もmainとのファイル差分はなかった。したがって、旧300件のうち何件を厳密に復元したかは算出できない。

## 今回保存した結果

[data/audit/2026-11-03-resumed](../../../data/audit/2026-11-03-resumed) に以下を保存した。

| ファイル | 内容 |
|---|---|
| all-entries.tsv | 全13,216項目。現分解・日本語解説・埋め込み原文・出典ファイル・候補フラグ・詳細ケースID |
| review-cases.json | 人が編集する163件/156項目の確認事項。155件の修正・再確認候補と8件の保持対照 |
| case-evidence.json / cases.tsv | 各ケースの現データ、旧ノード/提案ノード、根拠、TSV所在、対象ID・提案参照先のガード結果 |
| semantic-priority.tsv | 1,428項目。指名ケース、既存07候補、原文不確実性、parts/noparts競合の和集合 |
| review-queue.tsv | 8,745項目。欠落・原文長等を含む広い候補集合 |
| root-groups.tsv / base-groups.tsv | 全231語根・単語語基1,794組の所属語。語基一覧は単語の分解のみで、句の分解を除く |
| note-parts-candidates.txt | 既存07スクリプトの372組/368項目（脚注が総数）。1項目に複数候補があり得る |
| summary.json / structural-errors.json | 再計算した集計と検査結果（構造エラー0） |
| input-sha256.json | 公開データ・編集用TSV・関連スクリプト・ケース入力・添付原本のSHA-256 |

TSVは引用符付き。セル内の改行は `\n` として保存している。Pythonの `csv.DictReader(..., delimiter='\t')` で読む。候補は重複するため件数を足して誤りの総数にしない。

## 語族点検で確認した具体例

旧報告の具体例を再照合したうえで、以下も調べた。根拠は各ケースの埋め込み原文と現解説。外部辞典で新たに裏付けたという意味ではない。

- `spiral` は原文speira（巻いたもの）と解説の双方が「息」との区別を示すのに `r:spir` へ接続。
- `curvy` はcurve系なのに走る `r:cur` へ接続。
- `participation` はparticipate + -ionなのに内部patiを「苦しむ」へ接続。
- `fermentation` はfervere系と説明しながら `r:fer`（運ぶ）と `r:ment`（心）へ接続。
- `corporation`、`collaboration`、`concentration`、`declaration`、`commemoration` 等で、語幹と派生接辞の境界に跨るratをratioへ接続。
- `donation`、`resignation`、`coordination`、`inclination`、`detonate` 等でも同様に内部natを「生まれる」へ接続。
- `transparency`、`compare`、`parcel`、`parasitic`、`impairment` はpar系の別義・別語源を再確認する対象。
- `for_good` の第1例文 “The school is crying out for good teachers.” は「良い教師」を求める文であり、「永久に」の用例ではない。
- `grateful` のPIE接続は接尾辞fulの祖語を拾った可能性があり、語全体の究極語源の誤りとは即断しない。`parent` もPIEの同形異根を確認する対象。

一括修正を防ぐため、`metropolitan`（母なる都市）、`compass`（歩み）、`legislation`等4語（法を運ぶ）、`separate`（parare）、`pregnant`（gnasci説）を保持対照にした。保持は当該接続についての判断で、語全体・解説の確定的な認証ではない。

18項目には参照先と綴りを検査した具体的分解案、10項目には日本語解説案がある。残るケースはリンク単位の修正方向や追加調査を記している。`integer` の-erのように同じ語に別の誤接続があるため、old_id/new_idだけを機械的に置換することを推奨しない。

## 全件フラグの意味と限界

| フラグ | 件数 | 解釈 |
|---|---:|---|
| NO_DECOMPOSITION | 6,711 | 単純語・保留を含む。欠陥の認定ではない |
| NO_JAPANESE_NOTE | 1,005 | すべて句。補充候補 |
| NO_EMBEDDED_ETYMOLOGY | 1,767 | 未収録であり、語源不明の証明ではない |
| SOURCE_LENGTH_NEAR_600_CANDIDATE | 2,107 | 590字以上。切断の確定ではない |
| SOURCE_UNCERTAINTY_NOTE_REVIEW | 926 | 英文の不確実性語と日本語の簡単な語彙検索。樹形図・遠い祖語・別義の偽陽性あり |
| ROOT_SURFACE_VARIANT | 140 | 登録forms外の表示。正当な異形を含む |
| PHRASE_MNEMONIC_VS_HISTORY | 324 | 記憶用説明と歴史的説明を区別する対象 |
| PARTS_NOPARTS_CONFLICT | 8 | 現生成器ではnopartsの後に手動partsが再適用される。意図を要確認 |
| NOTE_ROOT_LINK_CANDIDATE | 368 | 原文ではなく日本語解説中の語源語と綴り一致を使う既存07の候補。接続を自動追加しない |

旧報告のフラグ定義を完全復元したものではない。旧1,131件と今回1,428件の差を、問題の増減として解釈しない。外部辞典との全件照合済み件数は今回0。全件台帳の状態は `screened_not_independently_verified`。

## 検証結果

- 全件検査：綴り、部品・PIE・関連語の参照先、indexの種別/順位/shard/品詞/部品/解説フラグ、形態素逆引き、meta件数・version、手動parts・解説TSVとの一致が成功。
- 提案の対象旧ID、提案先ID、具体的分解案の綴り・参照先ガード：不一致0。
- 監査テスト6件成功。壊れた参照・綴り・shard・PIE・meta・重複index・逆引きの破損を検出する。
- 既存Vitest：8ファイル11テスト成功。
- `python3 scripts/data/06_lint.py`：エラー0、警告0。
- `npm run build`：TypeScript、本番ビルド、PWA生成成功。既存の500kB超チャンク警告あり。

再現性と公開データ非変更の最終確認はPROGRESS.mdに記録する。rawダンプがないため `04_build.py` の全再生成は未実行。今回の監査ツールはレビュー出力だけを書き、修正overlayとしては動作しない。

## 残作業

1. Claudeが155件の候補を採用・修正・保留に分け、[DECISIONS.tsv](DECISIONS.tsv) に出典・判断者・理由を記録する。
2. 原文が切断されたもの、同形異源、別語義、仮説語源は外部辞典を参照して判断する。未収録の語基を既存の同綴り語へ無理に接続しない。
3. 残る優先候補1,428項目を全件台帳と照合して順次校閲する。指名ケースを含むため重複作業を避ける。
4. 旧300件の完全なcorrections.json等が回収できれば今回の候補と照合する。現時点で全復元したとは言えない。
5. 採用後は公開JSONと手動TSV・逆引き・index・metaを同時に更新し、rawがある環境で完全再生成と差分確認をする。
6. 語源番号・言語・語義・由来の確度・直接派生と同祖を区別する生成器/UI設計は別途実装する。
7. Claude確認用Draft PRは [#85](https://github.com/MasakiNiwa/Neuron-English-Vocabulary/pull/85) として作成済み。外部辞典の全件個別校閲と採否判断は未完了。mainへマージしない。
