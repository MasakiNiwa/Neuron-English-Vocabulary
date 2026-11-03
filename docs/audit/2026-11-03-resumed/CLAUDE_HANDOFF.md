# Claudeへの引継ぎ

最新の修正後レビュー依頼は [CLAUDE_FINAL_HANDOFF.md](../../etymology-review/CLAUDE_FINAL_HANDOFF.md) です。

現在の共通作業入口は [語源分解・解説の修正作業](../../etymology-review/README.md) です。Geminiでの修正後はそのFIX_LOGとDECISIONSを確認してください。以下は修正前の監査の引継ぎ記録です。修正後に08をデフォルト実行せず、共通手順の09を使ってください。

最初に [REPORT.md](REPORT.md) と [PROGRESS.md](PROGRESS.md) を読む。旧添付原本の「300件反映済み」は現在のGit状態では確認できない。今回の公開データはmainと同じで、修正案はレビュー資料にのみ保存してある。

1. `data/audit/2026-11-03-resumed/cases.tsv` で一覧し、`case-evidence.json` の同じIDで現分解・原文・解説・TSV所在・修正方向を確認する。
2. まず明示的な原文/解説と接続ノードの意味が矛盾するケースを点検する。`preserve_control` は修正対象一覧ではない。`pie_review` や `sense_review` も誤り確定扱いにしない。
3. `proposed_parts` と `proposed_note` は採用待ちの具体案。参照・綴りの成功は歴史的正しさを証明しない。`old_id/new_id` だけがあるケースは全文を再確認し、分割境界も見直す。nullは未接続表示を意味する。
4. [DECISIONS.tsv](DECISIONS.tsv) に `accept` / `revise` / `defer` / `reject`、外部出典のURL・対象語義・根拠・判断者を残す。台帳はこの判断ファイルを読んで「校閲済み」に書き換える仕様にはしていない。全件の単一 `screened` 状態を正確性の認証と解釈しない。
5. 一度に扱うケース群を選び、PROGRESS.mdに開始・終了IDと次の未完了IDを追記してコミットする。mainへのマージは行わない。
6. 採用時は古い手動parts/nopartsとの競合を確認する。原文の語源番号・別義・究極語源の仮説性を維持し、正式TSVと生成物を一緒に変更する。現ブランチに適用用overlayはない。

## 再実行

リポジトリ `/workspace/Neuron-English-Vocabulary` で実行する。標準Pythonのみで監査可能。

```bash
python3 scripts/data/08_etymology_audit.py
python3 -m unittest discover -s scripts/data -p test_etymology_audit.py -v
python3 scripts/data/06_lint.py
npm test
npm run build
```

生成される監査ファイルは再実行で上書きされる。編集する入力は `review-cases.json`、手動の判断記録はこのディレクトリの `DECISIONS.tsv` に置く。`--output /tmp/nev-audit-check` を指定すれば別ディレクトリに検査結果を出せる。監査は任意のカレントディレクトリから実行でき、公開データ・手動TSVへは書き込まない。rawが未配置なのでデータ完全再生成は別途必要。

Claude確認用Draft PRは [#85](https://github.com/MasakiNiwa/Neuron-English-Vocabulary/pull/85)。公開後の環境でGitHub API接続が成功し、作成済みである。同じ作業の重複PRは作らない。進捗と採否はこのPRのブランチへ追記する。mainへのマージや、Claudeへのメンション・他人への通知は依頼されていない。
