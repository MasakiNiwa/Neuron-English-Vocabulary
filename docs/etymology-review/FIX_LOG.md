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


## 2026-11-03 JST：バッチ2（C024〜C050, C055〜C074, C096〜C098, C100〜C104：同形異語根・誤語基リンク修正＋解説ブラッシュアップ）

- 日付・担当モデル・開始コミット：2026-11-03 JST / Gemini / `74716ca`
- 対象ケースID / 見出し語：
  - 同形異語根置換（24件）：C024 (`passion`), C025 (`passive`), C026 (`compassion`), C098 (`compassionate`), C027 (`important`), C028 (`importance`), C029 (`reporter`), C030 (`attention`), C031 (`extent`), C032 (`intent`), C033 (`curious`), C034 (`curiosity`), C035 (`accuracy`), C036 (`geometric`), C037 (`symmetric`), C038 (`apparent`), C039 (`transparent`), C101 (`transparency`), C040 (`preparation`), C041 (`pair`), C102 (`compare`), C055 (`fundamental`), C056 (`instrumental`), C057 (`detrimental`), C104 (`parcel`)
  - 誤語根・誤語基リンク解除および再構成（31件）：C042 (`parent`), C043 (`gastric`), C044 (`visceral`), C045 (`viscosity`), C046 (`tentative`), C047 (`tactic`), C048 (`tactical`), C049 (`saline`), C050 (`saloon`), C058 (`lateral`), C059 (`Latin`), C060 (`regulate`), C061 (`speculate`), C062 (`circulate`), C063 (`contemplate`), C064 (`irony`), C065 (`flower`), C066 (`corner`), C067 (`bullet`), C068 (`voltage`), C069 (`patronage`), C070 (`orphanage`), C071 (`signage`), C072 (`kindred`), C073 (`cinematic`), C074 (`kidnap`), C096 (`curvy`), C097 (`spiral`), C100 (`patio`), C103 (`impairment`)
- 採用 / 修正して採用 / 保留 / 却下（ID付き）：
  - 採用 (`accept`)：C024〜C041, C043〜C048, C055〜C058, C068〜C074, C096〜C098, C101〜C104
  - 修正して採用 (`revise`)：
    - C042 (`parent`), C049 (`saline`), C050 (`saloon`), C059 (`Latin`), C064 (`irony`), C065 (`flower`), C066 (`corner`), C067 (`bullet`), C100 (`patio`)：誤リンク解除後に有効な形態素リンクが残らないため `noparts` 化（`Latin` は `004.tsv` / `014.tsv` の大文字 `Latin` 追加で対応）
    - C060 (`regulate`), C061 (`speculate`), C062 (`circulate`), C063 (`contemplate`)：語幹末 `l` + `-ate` が `r:lat` に誤結合していた問題を解消し、それぞれ本来の語根・語基と `ate=suf:ate` に再構成
- 実際に適用したケースID（採否判断だけと区別）：上記55件すべてデータ実装済み
- 参照した辞典URL・語義・根拠：`DECISIONS.tsv` の対応行（`embedded source only`）
- 変更ファイルと変更理由：
  - `data/overrides/004.tsv`, `014.tsv`, `043.tsv`, `044.tsv`, `061.tsv`, `063.tsv`：既存の手動オーバーライド修正および新規 `parts` / `noparts` 定義追加
  - `data/explanations/011.tsv`, `016.tsv`, `018.tsv`, `025.tsv`, `036.tsv`, `037.tsv`, `040.tsv`, `043.tsv`, `044.tsv`：同形異語源（`parent` vs `appear`, `irony` vs `iron`, `flower` vs `flow`, `corner` vs `corn`, `bullet` vs `bull`, `kidnap` vs `nap` 等）の識別を助ける解説ブラッシュアップ
  - `public/data/entries/*.json`, `public/data/index.json`, `public/data/morphemes.json`, `public/data/meta.json`：同期スクリプトによる再生成
  - `docs/audit/2026-11-03-resumed/DECISIONS.tsv`, `docs/etymology-review/results/batch-02.json`：判断記録と検証レポートの保存
- 再生成：ガード付き限定同期（`scripts/data/10_sync_fixes.py`）
- 同期処理の再適用結果（2回目の差分）：`changed_files: []`（差分0件）
- 検証コマンド・終了結果・テスト数・未実行項目：
  - `python scripts/data/06_lint.py`：エラー0件 / 警告0件
  - `python scripts/data/09_verify_after_fixes.py --report docs/etymology-review/results/batch-02.json`：`structural_errors: []`、C001〜C050, C055〜C074, C096〜C098, C100〜C104 計78件の `guard_matches: false` を確認
  - `python -m unittest discover -s scripts/data -p "test_*.py" -v`：11件成功
- 代表語の表示確認：`passion` (`r:path`), `attention` (`r:tend`), `curious` (`r:cura`), `apparent` (`r:parere`), `preparation` (`r:para`), `compare` (`r:par`), `parent` (`noparts`), `regulate` (`reg=r:reg ul ate=suf:ate`), `circulate` (`circul=w:circle ate=suf:ate`), `irony` (`noparts`), `voltage` (`volt=w:volt age`) を確認
- 次の未完了ID・保留理由：次はバッチ3（C051〜C054, C075〜C080, C099, C105〜C155：再分割 `-nat-` / `-rat-` / 複合語等 全61件）へ進む
- コミットSHA（コミット後の報告に記載）：次ステップでコミット


## 2026-11-03 JST：バッチ3（C051〜C054, C075〜C080, C099, C105〜C155：形態素境界の再分割＋解説ブラッシュアップ）

- 日付・担当モデル・開始コミット：2026-11-03 JST / Gemini / `b891840`
- 対象ケースID / 見出し語：
  - 代表例の再分割（4件）：C051 (`inspiration`), C052 (`cooperation`), C053 (`determination`), C054 (`nomination`)
  - 語基・複合語の再分割（13件）：C075 (`biker`), C076 (`comedic`), C077 (`parenthesis`), C078 (`psychotherapy`), C079 (`theorist`), C080 (`consultant`), C099 (`participation`), C105 (`parasitic`), C106 (`sentimental`), C107 (`departmental`), C108 (`fragmentation`), C109 (`rudimentary`), C110/C111 (`fermentation`)
  - `-nat-` 境界の再分割（16件）：C112 (`alternative`), C113 (`dominate`), C114 (`alternate`), C115 (`donation`), C116 (`resignation`), C117 (`coordination`), C118 (`designation`), C119 (`discriminate`), C120 (`ordination`), C121 (`designate`), C122 (`inclination`), C123 (`affectionate`), C124 (`denomination`), C125 (`dissemination`), C126 (`ornate`), C127 (`detonate`)
  - `-rat-` 境界および関連語の再分割（28件）：C128 (`corporate`), C129 (`corporation`), C130 (`collaboration`), C131 (`concentration`), C132 (`federation`), C133 (`demonstrate`), C134 (`separation`), C135 (`declaration`), C136 (`apparatus`), C137 (`acceleration`), C138/C152 (`aspiration`), C139 (`expiration`), C140 (`incorporation`), C141 (`iteration`), C142 (`doctorate`), C143 (`saturation`), C144 (`temperate`), C145 (`exaggeration`), C146 (`commemoration`), C147 (`disparate`), C148 (`reparation`), C149 (`consecrate`), C150 (`deliberation`), C151 (`reiterate`), C153 (`consult`), C154 (`consultation`), C155 (`congratulate`)
- 採用 / 修正して採用 / 保留 / 却下（ID付き）：
  - 採用 (`accept`)：C051〜C054, C075〜C080, C099, C105〜C152, C154, C155（計61件）
  - 修正して採用 (`revise`)：C153 (`consult`：ラテン語 `consulere` の後半 `-sulere` は究極語源が未確定であり、`salire`（跳ぶ: `r:sal`）への誤リンクを外すと単一語基となるため `noparts` 化）
- 実際に適用したケースID（採否判断だけと区別）：上記62件（60見出し語）すべてデータ実装済み
- 参照した辞典URL・語義・根拠：`DECISIONS.tsv` の対応行（`embedded source only`）
- 変更ファイルと変更理由：
  - `data/overrides/038.tsv`, `063.tsv`：`parenthesis` の既存オーバーライド修正および新規再分割 `parts` / `noparts` 定義の追加
  - `data/explanations/003.tsv`, `005.tsv`, `012.tsv`：`collaboration`（`labor` 語幹の明示）、`consultant`（`sult=跳ぶ` の記述を改め `consult` + `-ant` に整理）、`deliberation`（天秤 `libra` 由来であり `liberate` とは別語源である旨を補足）の解説ブラッシュアップ
  - `public/data/entries/*.json`, `public/data/index.json`, `public/data/morphemes.json`, `public/data/meta.json`：同期スクリプトによる再生成
  - `docs/audit/2026-11-03-resumed/DECISIONS.tsv`, `docs/etymology-review/results/batch-03.json`：判断記録と検証レポートの保存
- 再生成：ガード付き限定同期（`scripts/data/10_sync_fixes.py`）
- 同期処理の再適用結果（2回目の差分）：`changed_files: []`（差分0件）
- 検証コマンド・終了結果・テスト数・未実行項目：
  - `python scripts/data/06_lint.py`：エラー0件 / 警告0件
  - `python scripts/data/09_verify_after_fixes.py --report docs/etymology-review/results/batch-03.json`：`structural_errors: []`、C001〜C080, C096〜C155 全140件の `guard_matches: false` を確認
  - `python -m unittest discover -s scripts/data -p "test_*.py" -v`：11件成功
- 代表語の表示確認：`inspiration`, `parenthesis`, `participation`, `alternative`, `donation`, `corporate`, `aspiration` (`a=pre:ad spir=r:spir ation=suf:ation`), `consult` (`noparts`), `consultation` (`consult=w:consult ation=suf:ation`) を確認
- 次の未完了ID・保留理由：次は最終バッチ4（C081〜C095：語義・解説・PIE・例文の確認と修正、および C156〜C163：保持対照8件の最終確認）へ進む
- コミットSHA（コミット後の報告に記載）：次ステップでコミット


## 2026-11-03 JST：バッチ4（C081〜C095：語義・解説・PIE・例文の確認と修正、および C156〜C163：保持対照8件の最終確認）

- 日付・担当モデル・開始コミット：2026-11-03 JST / Gemini / `95f595c`
- 対象ケースID / 見出し語：
  - 語義・形態素区分確認（2件）：C081 (`shuttle`), C082 (`tier`)
  - 解説精査・ブラッシュアップ（10件）：C083 (`grateful`), C084 (`parent`), C085 (`consultant`), C086 (`monkey`), C087 (`desire`), C088 (`consider`), C089 (`on_fire`), C090 (`get_started`), C091 (`put_up_with`), C092 (`for_good`)
  - PIE・例文精査（3件）：C093 (`grateful`), C094 (`for_good`), C095 (`parent`)
  - 保持対照群の維持確認（8件）：C156 (`metropolitan`), C157 (`pregnant`), C158 (`compass`), C159 (`legislation`), C160 (`legislative`), C161 (`legislature`), C162 (`legislator`), C163 (`separate`)
- 採用 / 修正して採用 / 保留 / 却下（ID付き）：
  - 採用 (`accept`)：C083〜C095, C156〜C163
  - 修正して採用 (`revise`)：C081 (`shuttle`：代表義は古英語 `scytel`「投げ矢」由来であり `shut`「閉じる」への単一語基リンクは誤解を招くため `noparts` 化し、解説で合流史を補足）、C082 (`tier`：代表義「段・層」は古フランス語 `tire` 由来であり `tie` + `-er` ではないため `noparts` 化し、解説で区別を明記）
- 実際に適用したケースID（採否判断だけと区別）：C081〜C095（全15件データ実装・確認済み）および C156〜C163（保持対照8件すべて無変更維持を確認）
- 参照した辞典URL・語義・根拠：`DECISIONS.tsv` の対応行（`embedded source only`）
- 変更ファイルと変更理由：
  - `data/overrides/063.tsv`：`shuttle`, `tier` を `noparts` に追加
  - `data/explanations/011.tsv`, `013.tsv`, `017.tsv`, `037.tsv`, `039.tsv`, `042.tsv`, `050.tsv`, `059.tsv`：`grateful`（ラテン語 `gratus` 借用の廃語 `grate` + `-ful`）、`monkey`（複数語源説の併記）、`desire` / `consider`（`sidus` 説の位置づけ明確化）、熟語4件（`on fire`, `get started`, `put up with`, `for good`）の自然な文法・語源解説へのブラッシュアップ
  - `scripts/data/10_sync_fixes.py`：`for_good` の誤マッチ第1例文（`id: 21606` "for good teachers"）を除去するガード付き `EXTRA_PATCHES` を追加
  - `public/data/entries/*.json`, `public/data/index.json`, `public/data/morphemes.json`, `public/data/meta.json`：同期スクリプトによる再生成
  - `docs/audit/2026-11-03-resumed/DECISIONS.tsv`, `docs/etymology-review/results/batch-04.json`：全163件の判断記録完了と検証レポートの保存
- 再生成：ガード付き限定同期（`scripts/data/10_sync_fixes.py`）
- 同期処理の再適用結果（2回目の差分）：`changed_files: []`（差分0件）
- 検証コマンド・終了結果・テスト数・未実行項目：
  - `python scripts/data/06_lint.py`：エラー0件 / 警告0件
  - `python scripts/data/09_verify_after_fixes.py --report docs/etymology-review/results/batch-04.json`：`structural_errors: []`、C156〜C163 が `historical_case_drift` に含まれず保持されていることを確認
  - `python -m unittest discover -s scripts/data -p "test_*.py" -v`：11件成功
- 代表語の表示確認：`shuttle`, `tier`, `grateful`, `monkey`, `desire`, `consider`, `on_fire`, `get_started`, `put_up_with`, `for_good`（例文2件のみ残存・誤マッチ例文除去済み）および保持対照8語を確認
- 次の未完了ID・保留理由：全163件（C001〜C163）完了（保留0件）
- コミットSHA（コミット後の報告に記載）：次ステップでコミット
