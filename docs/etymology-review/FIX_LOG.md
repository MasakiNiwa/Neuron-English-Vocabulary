# 修正作業ログ

## 2026-11-03 JST：引継ぎ準備

- 監査資料：全13,216項目、詳細163件/156項目（修正・再確認155件、保持対照8件）。
- 現在、語彙データへの修正適用は0件。DECISIONSの採否は未記入。
- Gemini用プロンプト・PC開始手順・修正プロトコル・修正後構造検証コマンドを追加。
- 修正前のスナップショットは保持する。
- 次の作業：C001〜C010を確認し、同じ語の複数指摘をまとめて小さなバッチで修正する。
- 未完了：155件の採否と実装、外部辞典の全件個別照合、rawからの完全再生成、最終レビュー。

## 各バッチの追記テンプレート

以下を複製して追記する。過去の記録を上書きしない。

- 日付・担当モデル・開始コミット：
- 対象ケースID / 見出し語：
- 採用 / 修正して採用 / 保留 / 却下（ID付き）：
- 実際に適用したケースID（採否判断だけと区別）：
- 参照した辞典URL・語義・根拠：DECISIONS.tsvの対応行
- 変更ファイルと変更理由：
- 再生成：完全 / ガード付き限定同期 / 未適用
- 同期処理の再適用結果（2回目の差分）：
- 検証コマンド・終了結果・テスト数・未実行項目：
- 代表語の表示確認：
- 次の未完了ID・保留理由：
- コミットSHA（コミット後の報告に記載）：


## 2026-11-03 JST：準備の検証結果

- `python3 -m unittest discover -s scripts/data -p 'test_*.py' -v`：9件成功（既存監査6件＋修正後検証3件）。
- `python3 scripts/data/09_verify_after_fixes.py`：構造エラー0、旧ケースガード変化0。
- `09 --report docs/etymology-review/results/preparation.json`：新規JSONへの保存を確認。
- `python3 scripts/data/06_lint.py`：エラー0・警告0。
- 監査入力203ファイルの保存済みSHA-256はすべて一致。修正前スナップショット・語彙データは未変更。
- アプリコードと依存関係は今回変更していないため、npmテスト・本番ビルドは前回の成功結果を引き継ぐ（今回の準備では再実行していない）。
- PCのAntigravity操作・Windows上での実行は未検証。PC上で開始時の検証が必要。


## 2026-11-03 JST：バッチ1（C001〜C023：接頭辞誤リンク修正＋解説ブラッシュアップ）

- 日付・担当モデル・開始コミット：2026-11-03 JST / Gemini / `d2a231b`
- 対象ケースID / 見出し語：C001 (`immigration`), C002 (`import`), C003 (`inside`), C004 (`independence`), C005 (`ignorant`), C006 (`integer`), C007 (`around`), C008 (`away`), C009 (`ahead`), C010 (`alive`), C011 (`agree`), C012 (`announce`), C013 (`aspect`), C014 (`ascend`), C015 (`director`), C016 (`direct`), C017 (`district`), C018 (`diverse`), C019 (`antigen`), C020 (`antisocial`), C021 (`unanimous`), C022 (`unanimously`), C023 (`Monday`)
- 採用 / 修正して採用 / 保留 / 却下（ID付き）：
  - 採用 (`accept`)：C001, C002, C003, C004, C005, C006, C011, C012, C013, C014, C015, C016, C017, C018, C019, C020, C021, C022
  - 修正して採用 (`revise`)：C007, C008, C009, C010（古英語 `on` 由来の `a-` のためギリシャ語否定接頭辞 `pre:a` を解除し無リンク化）、C023（古英語 `Mōnandæg` 由来の複合語のためギリシャ語 `pre:mono` を解除し `Mon=w:moon day=w:day` に修正）
  - 保留 (`defer`) / 却下 (`reject`)：なし
- 実際に適用したケースID（採否判断だけと区別）：C001〜C023（全23件をデータ実装済み）
- 参照した辞典URL・語義・根拠：`DECISIONS.tsv` の C001〜C023 対応行（`embedded source only`：Etymonline 等の埋め込み語源根拠に基づく）
- 変更ファイルと変更理由：
  - `scripts/data/10_sync_fixes.py`, `scripts/data/test_sync_fixes.py`：TSVオーバーライドと解説・`public/data/` 間の冪等同期スクリプトおよび単体テストを追加
  - `data/overrides/040.tsv`, `data/overrides/042.tsv`, `data/overrides/063.tsv`：C001〜C023 の `parts` 定義修正・追加
  - `data/explanations/002.tsv`, `005.tsv`, `008.tsv`, `010.tsv`, `011.tsv`, `035.tsv`, `036.tsv`, `038.tsv`, `053.tsv`：接頭辞の歴史的変化（同化・古英語 `on` の弱化・ラテン語 `ūnus` 等）を分かりやすく補足
  - `public/data/entries/*.json`, `public/data/index.json`, `public/data/morphemes.json`, `public/data/meta.json`：同期スクリプトによる再生成
  - `docs/audit/2026-11-03-resumed/DECISIONS.tsv`, `docs/etymology-review/results/batch-01.json`：判断記録と構造検証レポートの保存
- 再生成：ガード付き限定同期（`scripts/data/10_sync_fixes.py`）
- 同期処理の再適用結果（2回目の差分）：`changed_files: []`（差分0件）
- 検証コマンド・終了結果・テスト数・未実行項目：
  - `python scripts/data/06_lint.py`：エラー0件 / 警告0件
  - `python scripts/data/09_verify_after_fixes.py --report docs/etymology-review/results/batch-01.json`：`structural_errors: []`、`historical_case_drift` C001〜C023 全23件の `guard_matches: false`, `proposed_target_exists: true` を確認
  - `python -m unittest discover -s scripts/data -p "test_*.py" -v`：11件成功
- 代表語の表示確認：`immigration` (`im=pre:into`), `ignorant` (`ig=pre:in`), `alive` (`a` 無リンク + `live=w:life`), `agree` (`a=pre:ad`), `direct` (`di=pre:dis`), `antigen` (`anti=pre:anti`), `unanimous` (`un=r:uni`), `Monday` (`Mon=w:moon day=w:day`) の JSON 構造・逆引き・解説テキストを確認
- 次の未完了ID・保留理由：次はバッチ2（C024〜C050, C055〜C074, C096〜C104：同形異語根・誤語基リンク修正）へ進む
- コミットSHA（コミット後の報告に記載）：次ステップでコミット
