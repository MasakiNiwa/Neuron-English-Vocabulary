# 修正と検証の手順

## 1. 作業の境界

修正は語彙データとその同期に必要な処理に限定する。UI/自動解析器の全面改修や依存関係の更新は別作業にする。元の監査資料は修正前の比較用資料であり、修正後の出力で上書きしない。新たな指摘にはG001等の別IDを付け、既存C001〜C163は付け替えない。

案件の採否は既存 `docs/audit/2026-11-03-resumed/DECISIONS.tsv` の同じ行に記録する。decisionにはaccept/revise/defer/reject、external_sourceには実際に読んだURL、reviewerにはGeminiなど担当者、notesには対象語義・根拠と実装済みかを明記する。外部未確認はURLを作らず「embedded source only」と記す。資料の採用と実装の完了は別なのでFIX_LOGにも適用状況を残す。

## 2. 変更前の状態を確認

- `git status`、ブランチ名、既存のDECISIONS/FIX_LOGを確認する。
- `npm ci`（ロックファイルを維持）、下記のデータlintと修正後検証を実行する。
- 08のデフォルト出力先は修正前の台帳であるため、修正後にデフォルト実行しない。

## 3. 正式データの編集

- `data/overrides/*.tsv`: parts/nopartsを調べ、同じ語への過去の指示との競合を除く。現生成器はnoparts適用後にmanual partsを適用するので、ファイル番号が大きいnopartsだけの追加では古いpartsが復活し得る。
- `data/explanations/*.tsv`: 既存行の解説を修正し、同一見出し語の重複を増やさない。
- `public/data/entries/*.json`: 正式TSVの内容と同期する。未登録ノードを捏造しない。適切なノードがないときは無接続または分解保留を検討する。
- `public/data/index.json`: 部品ID列（w:を除くparts IDとpie）と解説フラグを同期する。
- `public/data/morphemes.json`: words逆引きを更新する。語基w:の変更時は、語基側のderも見直す。derは原典と自動逆リンクが混在し最大20件なので、一括削除や無制限追記をしない。
- `public/data/meta.json`: 実件数に合わせる。生成日・versionを変えた場合はindex.vとの一致を保つ。完全再生成していないのに実施したように記録しない。

rawダンプがPCにある場合は `scripts/data/README.md` の手順で完全再生成し、無関係な差分も確認する。大容量rawのダウンロードは必要性と容量を先に調べる。

rawがない場合は、正式TSVと既存生成物に対する限定的な同期処理を作る。変更前parts/note照合のガード、既に適用済みの場合の無変更、予期しない入力での停止、index/逆引き/meta同期を実装・検証する。小さなバッチで進め、同じ処理を2回実行して2回目の差分が0であることを確認する。今回の準備にはその適用処理は含まれていない。作成・確認が難しい場合は提案/TSV段階と明記して保留し、実装完了と報告しない。

## 4. バッチごとの検証

PCのリポジトリルートで実行する。Pythonは3.10以上、Windowsの実行名は環境に合わせる。

```bash
python3 scripts/data/06_lint.py
python3 scripts/data/09_verify_after_fixes.py
python3 -m unittest discover -s scripts/data -p 'test_*.py' -v
npm test
npm run build
```

09は毎回一時ディレクトリで08を実行し、公開データとTSV・index・逆引き・metaの構造エラーがあれば非ゼロで終了する。修正前old_idガードの変化は別に一覧化する。構造検査の成功は語源の正しさや全ケースの完了を保証しない。ガード変化をDECISIONSと修正差分に照合すること。

`09 --report <新規JSONファイル>` で構造検査結果を保存できる。既存レポートやソース・データ領域へは書き込めない。例: `--report docs/etymology-review/results/batch-01.json`。

修正した代表項目は開発サーバー `npm run dev` で表示も確認する。今回クラウドでAntigravity自体やPC上の操作は試験していない。失敗・未実行・部分成功を区別し、テスト数と実行コマンドをFIX_LOGへ記す。

## 5. 後日のレビューへ渡す条件

- ケースごとの根拠と実装状況が明確で、未解決を完了数に含めない。
- 正式TSV・公開JSON・関連インデックスが同期し、意味のあるテストが通る。
- raw完全再生成、限定同期、未適用のどれかを明記する。
- 誤った一括修正がないことを保持対照で確認する。
- 差分はレビュー用ブランチへコミットし、PR #85はDraftのままにする。

この条件が揃えば「レビューに渡せる状態」。Claudeの承認やmainへの取り込みが済んだ状態とは区別する。
