# Gemini修正後のレビュー

日付：2026-11-03 JST。対象：`d2a231b` → `814e71c8f8e5c152aa17e0bd1c03c1f8d5b4ac8a`（Geminiの4コミット）。

**結論：構造・同期・テストは成功。ただし意味面の再修正が必要。Draftを維持し、現状を最終承認済みとはしない。** このレビューではGeminiの語彙データをさらに書き換えず、確認結果と差戻し事項を保存した。

## 対応範囲の確認

- DECISIONSは全163行に判断あり：accept 142、revise 21、defer 0。ただし全行のexternal_sourceは `embedded source only` であり、外部辞典の全件校閲が完了したわけではない。
- 公開entriesの意味的なJSON差分は163項目。parts変更140項目、note変更32項目、例文変更1項目、der変更16項目、manualParts変更124項目（重複あり）。
- 163項目のうち148項目は指名候補、15項目は語基側derの同期。指名156項目の残る8項目は保持対照で、いずれも無変更。
- 語基側derの追加・削除は、iron/irony、flow/flower、moon/Monday、therapy/psychotherapy等の接続変更に対応していた。
- 元の監査スナップショット `data/audit/2026-11-03-resumed` は変更されていない。DECISIONSと追記ログは別途更新されている。

## 取り込み前の再修正事項

### R1：iteration / reiterateに別語根を新規接続している

対象：C141、C151。`data/overrides/063.tsv:118` と `:128`。

`iter=r:it` としているが、登録 `r:it` はラテン語ire（行く）、表示意味も「行く」。reiterateの埋め込み原文はiterare → iterum（再び）と明示している。外部の [Wiktionary: iterum, Latin Etymology 1](https://en.wiktionary.org/wiki/iterum#Latin) でも「again」の副詞は「other」に遡る別の系列であり、同綴りの旅・道系の語形と区別する必要がある。今回のrat誤接続を外した代わりに、再び意味の異なるノードを入れている。

対応：根拠のない `r:it` を外し、既存の適切な語基ノードがあれば再分割、なければiterを無接続で表示する。TSV・entries・index・形態素逆引きを同期し、2語について意味のある回帰検査を追加する。DECISIONSの「実装済み」を修正待ちとして扱う。

### R2：get startedの説明が過度に一般化している

対象：C090。`data/explanations/059.tsv:18`。

「get + 過去分詞で『〜し始める・取りかかる』を表す構文」は一般則として誤解を招く。例えばget injuredは「けがをする」であり、「けがをし始める」という開始表現ではない。get startedという句全体の意味とget＋過去分詞の一般的な用法を分ける必要がある。

対応案：「get startedで『始める・取りかかる』。Let's get started. は『さあ始めましょう』。startedを常に受け身の『始められた』と直訳しない。」など、対象の句に限定する。TSVと公開noteを同期する。

### R3：aheadの不確実性が落ちている

対象：C009に関連する解説追加。`data/explanations/011.tsv:137`。

埋め込み原文と、今回読んだ [Wiktionary: ahead](https://en.wiktionary.org/wiki/ahead#Etymology) は `Perhaps originally a nautical term`。Geminiの解説は「もとは航海用語」と断定している。今回の監査方針である、仮説と確定した来歴の区別に反する。

対応：航海用語起源は説・可能性と明示するか、確実なa- + headと現在の意味だけを書く。TSVと公開noteを同期する。

## 最終レビューで残す確認事項

- **R4：PIEの語義衝突**。C095の判断は `pie:per` を「bring forth」と説明して保持しているが、現在の登録ノードの意味は「前へ・通って・試す」。親parioの「産む」の語根と同一かは未証明。別の同形PIE語根を混同していないか確認し、未解決ならdeferへ戻す。C093のgratefulはful側の祖語という説明があるが、語全体と部品の祖語を区別できないデータ設計の課題として残す。
- **R5：新たに追加した由来の根拠**。C091 `put_up_with` の解説は「泊める・受け入れる」から発達したとする新しい歴史説明を加えたが、公開データにその語源原文はなく、判断記録も外部未確認。C088 `consider` の星の説も公開原文はconsiderareまで。追加の辞典根拠を記録するか、語義説明に限定・保留する。
- **R6：同期スクリプトのガード範囲**。`10_sync_fixes.py:126` 以降ではTSVからparts/noteを直接適用する。既知のbefore/afterを照合するガードはEXTRA_PATCHESだけで、通常TSVにはない。メモリ上でimportの現在part IDを予期しない値に変えても、拒否せずpre:intoへ上書きされた。冪等性と構造チェックは成功しているが、「すべての変更が変更前照合付き」という意味ではない。今後の適用は既知の開始コミット/入力ハッシュで制限するか、実際にbefore/afterガードを追加する。
- **R7：完全再生成**。rawからの04_build.pyは未実行。for_goodの誤例文除去は10のEXTRA_PATCHESにのみ記載され、04だけを再実行すると復活する可能性がある。完全生成後に10のパッチ段階を必ず適用するか、生成段階での除外を正式に定義して再現性を確認する。

R4〜R7は構造テストだけでは完了判定できない。Geminiの「全163件完了」は一次判断・限定同期の実装範囲についての記録として読み、外部辞典での最終認証と解釈しない。

## 再検証の証拠

| 検査 | 結果 |
|---|---|
| Python unittest（監査・修正後検証・同期） | 11件成功 |
| 06_lint.py | エラー0・警告0 |
| 09_verify_after_fixes.py | 構造エラー0、修正前ガード変化140件 |
| 10_sync_fixes.py --dry-run | changed_files: [] |
| 一時コピーでd2a231bの公開JSONに現在のTSVと10を適用 | 現在の全公開JSONと意味的に一致 |
| 既存Vitest | 8ファイル11テスト成功 |
| npm run build | TypeScript・本番ビルド・PWA生成成功（既存チャンクサイズ警告あり） |
| 保持対照8項目 | 全フィールド無変更 |
| git diff --check d2a231b..814e71c | 成功 |

PC側の「代表語の表示確認」というログはデータ確認か実際の画面確認か判別できない。今回も画面表示は未検証。raw完全再生成と外部辞典の全件照合は未実行。追加の外部確認は上記iterumとaheadの公開ページに限定する。

## 次の担当者へ

まずR1〜R3を小さな修正コミットで解消し、R4〜R7の未完了状態を判断台帳・FIX_LOGに反映する。採用と実装、構造検証と意味の正確性を分けて記録する。修正後に同じ検査を再実行し、PR #85は最終レビューまでDraftのまま保つ。mainへのマージは行っていない。
