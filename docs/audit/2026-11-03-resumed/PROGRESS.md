# 語源監査の再開記録

## 2026-11-03 JST — チェックポイント1：照合

- 基準 main: `1f65cbefdf0d41eb868533f378a8ed5ea0a4b808`。
- 作業ブランチ: `review/etymology-audit-resume-2026-11-03`。
- 添付報告書は UPLOADED_REPORT.md に原文保存（記載事項は未検証の引継ぎ情報として扱う）。
- GitHub の旧 `review/full-etymology-audit-2026-11-03` は main と同一 SHA。報告書が記す300件の修正コミットは存在しない。
- もう一つのリモート作業ブランチ `ccr-9c0b29b3-4scwwn` も main とのファイル差分なし。
- corrections.json、全件台帳、CLAUDE_HANDOFF.md、063.tsv は現在のチェックアウトに存在しない。
- 公開データの version は `20261102`。報告書の `20261103-audit1` は未反映。
- Git 読み取りは成功。参照会話を読むツールは利用不可。GitHub API は Forbidden のため PR 作成経路を調査中。

## 未完了

- [ ] 現在の全13,216項目について再現可能な構造検査・台帳・候補一覧を再構築。
- [ ] 報告書の具体例を現データと照合し、証拠付きのClaude向け修正候補を復元。
- [ ] 新たな問題の点検と記録。
- [ ] テスト・型チェック・ビルド・データlint・出力の再実行一致を検証。
- [ ] ブランチを送信し、Claude確認用PRを作成。
- [ ] 外部辞典との全件個別校閲（今回の機械検査と区別）。
- [ ] 失われた300件の完全な差分の復元（添付は全件明細を含まない）。
- [ ] rawダンプからの完全再生成（rawデータ未確認）。

mainへはマージしない。修正案の採否と外部辞典での検証は、機械的な整合性検査とは別の状態で記録する。

## 2026-11-03 JST — チェックポイント2：全件再検査と語族レビュー

- 全13,216項目の台帳、全231語根・単語の語基1,794組の接続一覧を再構築。
- 構造検査0件、候補の対象ID・提案分解の参照先・綴りガード不一致0件。
- 163件/156項目の詳細記録。うち155件は修正・再確認候補、8件は一括置換を防ぐ保持対照。
- 添付の具体例に加え、spiral、curvy、participation、fermentationなどの語族を再点検。
- 書き下ろし解説10件と分解18項目（fermentationは2件の指摘に共有）の具体案を用意。採用は未実施。
- 既存07スクリプトの語根未接続候補は372組/368項目。旧報告の365組とは基準データが異なる。
- 優先台帳1,428項目はスクリーニング候補の和集合。誤り確定件数ではない。保持対照も含む。
- 監査自身の破損データ検出テスト6件成功。データlintはエラー・警告0。
- 新ブランチへの最初のpush成功。GitHub APIはCONNECT段階で403。api.github.comの追加を環境ドラフトに保存したが、実行中設定への適用は未確認。

全件の外部辞典照合、旧300件の明細回収、raw完全再生成、修正案の採否は引き続き未完了。公開JSON/TSVは変更していない。

## 2026-11-03 JST — チェックポイント3：検証とClaude引継ぎ

- [x] 全件台帳・検査・候補一覧を再構築し専用ブランチに保存。
- [x] 詳細163件/156項目と保持対照、提案解説10件・提案分解18項目を記録。
- [x] 監査テスト6件、既存テスト11件、データlint、型チェック・本番ビルド・PWA生成成功。
- [x] `/tmp` をカレントディレクトリとして別の出力先へ再実行し、生成11ファイルのバイト一致を確認。
- [x] 公開JSON・手動修正TSV・解説TSV・アプリ本体・依存宣言・ロックファイル・既存生成器にmainとの差分なしを確認。
- [x] REPORT.md、CLAUDE_HANDOFF.md、DECISIONS.tsv、PR_BODY.mdを用意。
- [ ] PR作成：GitHub APIの接続制限が残る。`gh pr list` は `api.github.com/graphql: Forbidden`。ブランチpushは成功している。
- [ ] 旧300件の完全復元、全件の外部辞典個別校閲、raw完全再生成、Claudeによる採否判断と反映。

環境設定のネットワーク追加ドラフトは保存済み（api.github.com）。ユーザーによる設定の保存・実行中設定への適用が必要。API接続が有効になったら既存PRの有無を確認してDraft PRを作る。API接続後に認証・権限の別エラーが出る可能性はまだ検証できていない。追加の秘密値をチャットで要求しない。

### PR作成の最終実行結果

`gh pr create --base main --head review/etymology-audit-resume-2026-11-03 --draft --body-file docs/audit/2026-11-03-resumed/PR_BODY.md` を実行したが、`Post https://api.github.com/graphql: Forbidden` で失敗。PRは作成されていない。本文とタイトル、ブランチの準備は完了している。環境設定でapi.github.comの許可を確認・保存し、設定ツールの案内に従って環境をPublishする必要がある。mainへのマージ操作は実行していない。


## 2026-11-03 JST — チェックポイント4：公開環境でPR作成完了

- 新しい公開済み環境でGitHub APIのHTTP 200と認証付きPR一覧取得を確認。以前のForbiddenは解消。
- mainは引き続き `1f65cbefdf0d41eb868533f378a8ed5ea0a4b808`。監査ブランチの保存済みHEADもGitHubと一致。
- 監査入力203ファイルのSHA-256が保存済みmanifestとすべて一致。
- [x] Claude確認用Draft PR #85を作成: https://github.com/MasakiNiwa/Neuron-English-Vocabulary/pull/85
- 現在のネットワークポリシーはunrestricted（制限なし）で適用済み。GitHub APIへの限定許可より広いが、動作を妨げる設定不備は確認できない。今回、環境設定の変更・公開は行っていない。
- mainへのマージは行っていない。外部辞典の全件校閲、旧300件の完全復元、raw再生成、Claudeの採否判断は引き続き未完了。

過去のチェックポイントにあるAPI拒否・PR未作成の記述は、その時点の履歴である。最新状態はこのチェックポイントを参照する。


## 2026-11-03 JST — チェックポイント5：担当AIに依存しない修正準備

- 共通入口 `docs/etymology-review/README.md`、Gemini用依頼文、修正手順、FIX_LOGを追加。
- 元の監査スナップショットを保持し、修正後の旧IDガード変化を構造破損と分ける09検証コマンドを追加。テスト9件・データlint・現データ検証成功。
- PR #85を継続利用し、タイトルと本文を語源品質点検中心の説明へ整理する。経緯の原本・既存資料は履歴として保持。
- ブランチ整理候補をBRANCHES.mdへ記録。既存ブランチの削除は実施しない。
- Geminiによるデータ修正はまだ未実施。次の未完了範囲と後日のレビュー条件は共通入口とFIX_LOGを参照。


## 2026-11-03 JST — チェックポイント6：Gemini（4Argon）による全163件の最終点検・データ同期・解説ブラッシュアップ完了

- 対象範囲：`data/audit/2026-11-03-resumed/review-cases.json` の全163件（修正・再確認155件 C001〜C155、保持対照8件 C156〜C163）。
- 実装済み内容：
  - [x] `scripts/data/10_sync_fixes.py` および単体テスト `scripts/data/test_sync_fixes.py` を新規作成（rawダンプ非依存のガード付き冪等同期、逆引き・`w:` 派生語 `der`・`index.json`・`meta.json` の完全同期）。
  - [x] **バッチ1（C001〜C023）**：接頭辞誤リンク23件の修正と日本語解説10件のブラッシュアップ（コミット `74716ca`、レポート `docs/etymology-review/results/batch-01.json`）。
  - [x] **バッチ2（C024〜C050, C055〜C074, C096〜C098, C100〜C104）**：同形異語根・誤語基リンク55件の修正と日本語解説9件のブラッシュアップ（コミット `b891840`、レポート `docs/etymology-review/results/batch-02.json`）。
  - [x] **バッチ3（C051〜C054, C075〜C080, C099, C105〜C155）**：`-nat-` / `-rat-` / 複合語等の形態素境界再分割62件と日本語解説3件のブラッシュアップ（コミット `95f595c`、レポート `docs/etymology-review/results/batch-03.json`）。
  - [x] **バッチ4（C081〜C095, C156〜C163）**：`shuttle` / `tier` の語義整合性確認（`noparts` 化）、日本語解説10件のブラッシュアップ、PIE整合性確認、`for_good` の誤マッチ第1例文（`id: 21606`）除去、および保持対照8件（C156〜C163）の無変更維持確認（コミット `5323029`、レポート `docs/etymology-review/results/batch-04.json`）。
  - [x] `docs/audit/2026-11-03-resumed/DECISIONS.tsv` 全163行の採否（`accept` 142件 / `revise` 21件 / `pending` 0件）および根拠の記録完了。
  - [x] `data/audit/2026-11-03-resumed/` の修正前スナップショットは無変更で保持。
- 検証結果：
  - `python scripts/data/06_lint.py`：エラー0件 / 警告0件。
  - `python scripts/data/10_sync_fixes.py --dry-run`：2回目以降の差分0件（`changed_files: []`）。
  - `python scripts/data/09_verify_after_fixes.py`：`structural_errors: []`、修正対象140件の `guard_matches: false`（旧誤リンク解消）かつ `proposed_target_exists: true`、保持対照 C156〜C163 の変化0件を確認。
  - `python -m unittest discover -s scripts/data -p "test_*.py" -v`：全11件成功。
- 未実施・今後の任意項目：
  - ローカル環境の `node_modules` が未インストールのため、`npm test` / `npm run build` は未実行（今回フロントエンドのアプリコードや依存パッケージは変更なし）。
  - GitHub への push および Draft PR #85 の更新（ローカル PC の `c:/Antigravity/Neuron-English-Vocabulary` ブランチ `review/etymology-audit-resume-2026-11-03` に全コミット保存済み）。


## 2026-11-03 JST — チェックポイント6：Gemini成果の独立レビュー

Geminiの814e71cまでを取得。構造・同期再現性・テストは成功したが、意味面の再修正事項あり。詳細と次の未完了項目はdocs/etymology-review/CHATGPT_REVIEW.md（R1〜R7）に保存。mainへのマージは行わずDraft維持。
