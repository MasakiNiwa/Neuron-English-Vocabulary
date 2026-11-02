# 語彙・語源分解・解説 総点検レポート

監査日: 2026-11-03（日本時間）
対象: `main` / `1f65cbefdf0d41eb868533f378a8ed5ea0a4b808`（v0.82.0、#84マージ後）
レビュー用ブランチ: `review/full-etymology-audit-2026-11-03`
目的: Claudeが修正候補の根拠を確認し、採用・修正・保留を判断できる状態にする。

## 1. 結論と、この監査が保証する範囲

全13,216項目（単語11,887・句1,329）を対象に、構造検査、解説・原文のパターン検査、語根231種類と英単語を語基にした1,794組の接続一覧の点検を行った。日本語解説のある句324項目も一覧で点検した。300項目に修正案を反映し、公開用JSON・手動TSV・逆引き・一覧の整合を確保した。

**これは「全項目の語源と日本語解説を外部辞典で一語ずつ検証し、正確性を認証した」という意味ではない。** 単語解説11,887件を一件ずつ外部辞典と突き合わせる個別校閲は未完了。全件スクリーニングと語族単位の点検を行い、問題が見つかった項目は埋め込み原文・解説を照合した。一部は外部辞典でも確認した。変更しなかった項目にも誤りが残る可能性がある。全件台帳の状態はそのため `screened_not_independently_verified` とし、変更案も `proposal_requires_claude_review` としている。

語源は綴りが合うだけでは正しくならない。同形異源・別義・借用段階・派生接尾辞と、遠い共通祖先との関係を区別する必要がある。未確定な代替分解を大量に作るより、誤った断定をいったん撤回し、再校閲の対象として残す方針にした。

| 項目 | 結果 |
|---|---:|
| 全件検査対象 | 13,216項目 |
| 変更候補を反映 | 300項目（単語296・句4） |
| 分解変更 | 293語 |
| 解説変更 | 10項目（分解変更と3件重複） |
| 分解をいったん保留 | 61語（293語の内数） |
| 代替分解・接続修正 | 232語 |
| 構造エラー | 0件 |
| 残る意味面の優先再校閲候補 | 1,131項目（誤りの確定件数ではない） |

#84の `number`、`remember`、`inflation`、`religion`、`former`、`track` の変更は維持した。`religion` の既存解説は語源に諸説あることを明示しており、今回一説に確定させる変更はしていない。

## 2. Claudeが最初に読むファイル

| ファイル | 用途 |
|---|---|
| [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) | 作業手順・採否判断・検証コマンド |
| [corrections.json](../../../data/audit/2026-11-03/corrections.json) | 300項目の旧新分解・旧新解説・理由・原文・元解説の所在 |
| [changes.tsv](../../../data/audit/2026-11-03/changes.tsv) | 同じ300項目を表で比較 |
| [all-entries.tsv](../../../data/audit/2026-11-03/all-entries.tsv) | 全13,216項目の分解・解説・埋め込み原文・状態・候補フラグ |
| [semantic-priority.tsv](../../../data/audit/2026-11-03/semantic-priority.tsv) | 意味不整合・不確実性の優先候補1,131項目 |
| [review-queue.tsv](../../../data/audit/2026-11-03/review-queue.tsv) | 欠落・綴り異形なども含む候補8,578項目 |
| [note-parts-candidates.tsv](../../../data/audit/2026-11-03/note-parts-candidates.tsv) | 既存07スクリプトによる未接続語根の候補365件 |
| [baseline-root-groups.tsv](../../../data/audit/2026-11-03/baseline-root-groups.tsv) | 修正前の全231語根と所属語 |
| [baseline-base-groups.tsv](../../../data/audit/2026-11-03/baseline-base-groups.tsv) | 修正前の英語語基1,794組と所属語（単語の分解対象） |
| [summary.json](../../../data/audit/2026-11-03/summary.json) | 再計算可能な件数・構造エラー数 |
| [SOURCES.md](SOURCES.md) | 外部で選択的に確認した辞典・確認範囲 |

監査スクリプトのTSVはセルを引用符で囲み、原文の改行を文字列 `\n` として保存する。原文そのものは公開JSONとmanifestを参照。`csv.DictReader(..., delimiter='\t')` か表計算ソフトで開くこと。13,216行の全件台帳はアプリの追加データではなくレビュー用スナップショット。

## 3. 変更案の主な分類

### 3.1 接頭辞の意味・言語が同じ綴りの別接辞に吸われる

| 例 | 修正前 | 修正案・判断 |
|---|---|---|
| immigration / import / inside | 否定の `pre:in` | 方向・位置の `pre:into` |
| independence / ignorant / integer | 方向の `pre:into` | 否定の `pre:in` |
| integer | `-er`が人を表す接尾辞にも接続 | その接続を撤回し文字列だけ残す |
| around / away / ahead / alive | ギリシャ語の否定 `pre:a` | 英語・ゲルマン語系のa-。未登録の接頭辞へ無理に接続せずm:null |
| agree / announce / aspect / ascend | 同じ否定 `pre:a` | ラテン語ad-やその異形の系統へ |
| director / direct / district / diverse | ギリシャ語 `pre:dia` | ラテン語dis-/di-へ |
| antigen / antisocial | ante-（前に） | anti-（反対・対抗） |
| unanimous / unanimously | un-（否定） | unusに由来するuni-（一つ） |
| Monday | mono-（一つ） | Moon + day |

`pre:into` は現在の既存ノード名であり、すべてのin-が文字通り「中へ」を意味するわけではない。強意・位置も含む。方向/否定の二分だけで語義全体を説明し切らないこと。

### 3.2 同綴りの語根・遠い同祖関係の混同

| 語・語族 | 問題 | 今回の対応 |
|---|---|---|
| passion / passive / compassion | 歩くpassus/passareと、苦しむpati/passusの混同 | 既存`r:path`はpatiも含む定義なのでそちらへ |
| important / importance / reporter | 運ぶportareを部分parsへ接続 | `r:part`→`r:port` |
| attention / extent / intent | 保つtenereと伸ばすtendereの混同 | `r:ten`→`r:tend` |
| curious / curiosity / accuracy | 走るcurrereと世話・注意curaの混同 | `r:cur`→`r:cura` |
| geometric / symmetric | 測定metronと母materの混同 | `r:mater`→`r:meter` |
| apparent / transparent | 現れるparereと準備するparareの混同 | `r:parere`へ |
| preparation / pair | 準備するparareと等しいparの混同 | それぞれ`r:para`、`r:par`へ |
| parent | pareo（現れる）とpario（産む）の混同 | 解説を訂正、対応ノードがないので分解保留 |
| gastric | astrの文字一致で「星」へ | 接続を撤回 |
| visceral / viscosity | visの文字一致で「見る」へ | visceralは保留、viscosityは語幹を無接続表示 |
| tentative / tactic / tactical | 試みる・並べる語史を「保つ」「触る」に混同 | 分解保留 |
| saline / saloon | salを「跳ぶ」のsalireへ | 分解保留 |

一語の `m` を置換して終わると、別の誤接続が残ることがある。`insecurity` は否定in-に加えてsecure側の語根を、`geometric` は語全体の分割を見直した。`integer`の-erも同じ理由で撤回した。

### 3.3 -ration / -nation / -mentalの内部に別の語根を見つけてしまう

`inspiration` のrat→ratio、`dominate` のnat→生まれる、`fundamental` のment→心などがあった。

- inspiration → in + spir + ation、cooperation → co + oper + ation。
- determination → de + termin + ation、nomination → nomin + ation。
- fundamental / instrumental / detrimental等の-mentは接尾辞側へ。
- `lateral`の「側面」と`r:lat`の「運ばれた」は別系統。`Latin`も同じノードへ接続しない。
- `regulate / speculate / circulate / contemplate`等は誤ったlat接続を含む分解を保留した。正しい語幹まで否定しているわけではない。Claudeが正しい部分分解を復元してよい。

綴りの連続部分を拾う設計のため、手動分解の語にも同じ種類の誤りがある。`manualParts:true`は校閲済み証明にならない。

### 3.4 普通の英単語と接尾辞・語幹の偶然の一致

| 誤った接続 | 対応 |
|---|---|
| irony → iron | 分解保留、iron側の派生リンクからも撤回 |
| flower → flow、corner → corn、bullet → bull | 代表義の語源分解として撤回 |
| voltage / patronage / orphanage / signage → age（年齢） | -ageを独立語ageへ接続しない。未登録接尾辞はm:null |
| kindred → red、cinematic → tic、kidnap → nap（昼寝） | 同綴り独立語への接続を外す |
| biker → bi-、comedic → co- + medi | bike / comedyを語基とする表示へ |
| parenthesis / psychotherapy / theorist | `the`→神への接続を外し、thesis / therapy / theoryへ |
| consultant → sult（跳ぶ） | consult + -antへ。究極語源を断定する解説も修正 |

`shuttle`は特に注意。shut+leが成立する別語義があり、shoot/shutとの遠い関係もあるため「絶対に無関係」とはしていない。代表義に対する一つの解析を保留した候補。`tier`も階層・列の意味とtie+erの別語義を分けて再校閲する必要がある。これらの保留を、そのまま確定的な誤語源一覧へ転記しないこと。

### 3.5 解説の断定・語源と記憶用イメージの混在

| 項目 | 修正案 |
|---|---|
| grateful | grateを「古英語」とする説明を訂正。ラテン語gratus系の借用語 |
| consultant | salire（跳ぶ）を確定した由来とせず、consultまでを確実な語基として説明 |
| parent | 産むparioと現れるpareoを区別 |
| monkey | monk+yを唯一の確定語源としない。Moneke説等も含め未確定と明示 |
| desire / consider | 星との関連説と、そこから現在の意味になった物語の確実性を区別 |
| on fire | 「火の上に」という位置の直訳を避け、燃焼中の状態と比喩を説明 |
| get started | 常に受け身の「始められる」とは解釈しない |
| put up with | 「掲げる→我慢」の物語を歴史的事実として断定しない |
| for good | goodを「確定したもの」と直訳する説明を外し、慣用句の意味を説明 |

残る句の解説にも、on/up/out等のイメージによる有用な覚え方は多い。しかし、それだけで慣用句の歴史的成立を証明したことにはならない。句324件のフラグはこの区別を促すもので、324件すべてが誤りという意味ではない。

## 4. 未解決の全件スクリーニング結果

以下は相互に重複する。合計して「誤りの件数」にしないこと。

| フラグ | 件数 | 解釈・推奨対応 |
|---|---:|---|
| NOTE_ROOT_MEANING_CANDIDATE | 76 | 解説中の明示形と登録語根の日本語意味が一致しにくい。日本語の言い換えによる偽陽性あり。まず原文と語義を確認 |
| SOURCE_UNCERTAINTY_UNMARKED_IN_NOTE | 1,057 | 原文に不確実性を示す語があるが、日本語に同種の標識が見つからない。原文が別説・別義を述べているだけの場合もある。自動で「諸説あり」を付けない |
| UNCERTAIN_OR_MULTIPLE_ORIGINS | 1,093 | 原文または解説に不明・仮説・複数説等の記述。断定語調と分解の強さを再確認 |
| ROOT_SURFACE_VARIANT | 159 | 部品の表記が登録forms外。正当な異形・屈折・縮約も含む。機械置換しない |
| SOURCE_MAY_BE_TRUNCATED | 2,107 | 原文が590文字以上。600字上限に達した可能性があり、末尾や後続の別語源を調べる |
| NO_EMBEDDED_ETYMOLOGY | 1,767 | 公開データに原文語源なし。語源不明の証明ではない |
| NO_DECOMPOSITION | 6,772 | 分解なし。単純語や不適切な分解を避けた語もあり、一律の欠陥ではない |
| NO_JAPANESE_NOTE | 1,005 | 日本語解説なし。すべて句。高頻度から補充すると有効 |
| PHRASE_MNEMONIC_VS_HISTORY | 324 | 解説のある句を、記憶用説明と歴史的語源の区別の観点で点検する対象 |

`semantic-priority.tsv`は最初の2種とIN_ROLE_CANDIDATEの和集合1,131項目。今回の明示in-衝突候補は0件だったが、これは否定/方向の取り違えが全語でなくなったことを保証しない。

既存07レポートの未接続語根候補は365件。出典で比較対象として言及した語や遠い同祖語も拾うので、全候補に語根を追加してはいけない。例としてdesire/considerは今回も星のノードを維持したが、解説は断定を弱めた。ノード側にも仮説を表す方法を検討すべき対象。

## 5. 再発の仕組みとClaudeへの実装提案

`04_build.py`の`analyze()`は、語源本文・テンプレート全体をまとめて形を探し、語幹・接辞・英単語との重なりを優先度で解消する。以下の限界がある。

1. 一致した文字列の語義・言語・借用段階・語源番号が部品のIDに保存されない。同じ本文に別の同綴り語源や比較対象があると混ざる。
2. prefixは最初の一致を採用し、否定in-判定に本文全体のnotやun-、残余の形容詞判定を使う。対象のin-の意味とnotの位置が対応しない。
3. 語尾の語根を接尾辞へ回す除外は語末限定で、fundamentalなどの内部-mentや長い派生語に足りない。
4. `der`は原典の派生語と解析から作った逆リンクを混ぜて最大20件へ切る。生成元を後から区別できない。
5. 手動partsとnopartsを別段階で適用するため、後のファイルにnopartsを書くだけでは、過去のmanual partsが復活し得る。

推奨する順序は、(a)300項目の採否、(b)同綴り語源・語義ごとの解析入力の分離、(c)エッジに直接由来/同祖/記憶用・確度・出典を持たせる設計、(d)その後に自動解析の再実行。直接の構成関係と遠い共通祖先を同じ「部品」で表示しない設計が必要。

raw語源を単純に長くするだけでは別義混入が悪化し得る。原文の語源番号とsenseを保持して、表示する代表義との対応を先に作ること。これらの生成器・UI仕様変更はこのブランチでは実装していない。

## 6. データ反映方法・再生成の制約

今回、元のWiktionary等のrawダンプは実行環境になかった。そのため`04_build.py`の完全再実行はしていない。既存生成物へ、変更前のparts/noteを照合するガード付き・再実行可能なoverlayを適用した。

- 正式な手動修正を`data/overrides/063.tsv`に集約し、対象語の古いparts/noparts指示を既存TSVから取り除いた。nopartsの適用順による復活を防ぐため。
- 解説10項目は元の`data/explanations/*.tsv`の行を修正し、重複行を追加しなかった。
- 対象のentries、index、morphemes.words、metaを更新。語基の追加・撤回に応じて`der`も更新した。
- 元のderは原典と自動逆リンクが混在するため、撤回した接続の原典由来部分を完全には区別できない。今回は誤った断定の撤回を優先。再生成で真に有効な関係が復元される場合は、語義ごとに確認する。
- 再生成で`der`の順序・20件制限などに差が出る可能性がある。rawが利用できるClaude環境で、最終的に完全ビルドと差分確認が必要。
- バージョンは`20261103-audit1`。生成時刻はmanifestに保存し、再適用でも出力が変わらない。

**公開用JSONだけを採用し、TSVを捨てないこと。TSVだけを採用して再生成しないこと。** どちらも次回ビルドとの不一致を作る。

## 7. 検証

- `06_lint.py`: エラー0、警告0。
- 新規全件検査: 綴り、部品参照、PIE参照、index、逆引き、meta、手動TSVと公開データの一致を全件検査してエラー0。
- 回帰テスト: 誤接続・否定接頭辞・#84維持・修正ガードなど10テスト。
- overlay二度目の適用: 公開データ・手動TSVの変更ファイル0（冪等性確認）。
- 既存アプリテスト: 8ファイル・11テスト成功。
- `npm run build`: 型チェックと本番ビルド成功。500kB超のチャンク警告あり（本変更はアプリコードを変更していない）。

これらの成功はデータ整合性と既知の誤接続の回帰防止を確認するもので、語源の正確性を自動証明するものではない。
