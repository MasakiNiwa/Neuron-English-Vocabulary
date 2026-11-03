# 語源分解・解説の修正作業

このディレクトリが、担当するAIを問わない共通の入口です。Geminiで根拠の明確な修正を行い、ChatGPTで差分・検証結果を整理し、Claudeが最終レビューできる状態へ進めます。Geminiの一次修正は実装済みです。ChatGPTが指摘事項の修正と再検証を行いました。最新状態は [Claudeへの最終引継ぎ](CLAUDE_FINAL_HANDOFF.md) を参照してください。最終承認・mainへの取り込みは未実施です。

## PCのAntigravityで始める

1. Antigravityでリポジトリ `MasakiNiwa/Neuron-English-Vocabulary` を開きます。未取得なら、使いやすいPC上のフォルダーで以下を実行します。Gitが必要です。

   ```bash
   git clone --branch review/etymology-audit-resume-2026-11-03 https://github.com/MasakiNiwa/Neuron-English-Vocabulary.git
   cd Neuron-English-Vocabulary
   ```

2. 取得済みの場合は、まず `git status` で未保存の変更を確認します。変更を消すreset/cleanはせず、問題がなければ `git fetch origin`、`git switch review/etymology-audit-resume-2026-11-03`、`git pull --ff-only` の順で進めます。分岐・競合が出たら自動で上書きしません。
3. Antigravityのモデル選択で利用可能なGeminiを選び、[ANTIGRAVITY_PROMPT.md](ANTIGRAVITY_PROMPT.md) のコードブロック内を会話に貼り付けます。特別なプラグインや独自ルール設定は不要です。この手順はPC上で未実行です。
4. 初回は10〜20件の小さな修正単位を完了させ、その後に対象を広げます。全件の辞典照合を一度に完了したとは扱いません。

Node.js 22.12以降の22系または24系、npm、Python 3.10以上が必要です。クラウドではNode 24.19.0/npm 11.9.0で検証済み。Windowsで `python3` がない場合は `py -3` または `python` に読み替えます。GitHubのログインはPC側の既存の認証を使います。APIキーをファイルやチャットに貼る必要はありません。

## 読む資料と編集する場所

| 用途 | ファイル |
|---|---|
| Geminiへの依頼文 | [ANTIGRAVITY_PROMPT.md](ANTIGRAVITY_PROMPT.md) |
| 修正ルール・データ同期・検証 | [FIX_PROTOCOL.md](FIX_PROTOCOL.md) |
| 作業履歴・次の担当者への報告 | [FIX_LOG.md](FIX_LOG.md) |
| ブランチ・PRの整理方針 | [BRANCHES.md](BRANCHES.md) |
| 個別163件の修正方向・根拠 | `data/audit/2026-11-03-resumed/review-cases.json` / `case-evidence.json` |
| ケースごとの採否 | `docs/audit/2026-11-03-resumed/DECISIONS.tsv` |
| 全13,216項目と残る候補 | `data/audit/2026-11-03-resumed/all-entries.tsv` / `semantic-priority.tsv` |
| 詳細な監査範囲・限界 | [監査レポート](../audit/2026-11-03-resumed/REPORT.md) |

歴史的な監査資料内の `proposal_requires_claude_review` や `pending_claude_review` は「未承認の提案」を表す既存ラベルです。Geminiも検討できます。採否欄は `accept` / `revise` / `defer` / `reject` に更新し、reviewer欄で担当モデルを区別します。保持対照8件は修正対象ではありません。

修正前の台帳・根拠JSON・manifest・ケースIDは比較用に保持し、上書きしません。修正後は `09_verify_after_fixes.py` を使います。旧レポートの経緯は履歴として残していますが、今回の作業目的は語源分解・解説の品質改善です。

## 完了後にChatGPTへ渡すもの

同じブランチへコミット・pushした後、PR #85のURL、Geminiの最後のコミットSHA、FIX_LOG.mdを伝えてください。ChatGPTが差分・整合性・未完了事項を再確認し、Claude向けレビュー資料を更新できます。pushできない場合は `git diff --binary HEAD` のパッチと新規ファイルを渡します（パッチだけでは未追跡ファイルを含みません）。mainへのマージや自動デプロイは行いません。
