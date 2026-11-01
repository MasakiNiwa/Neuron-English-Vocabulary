# ニューロン英単語 (Neuron English Vocabulary)

語源や意味のつながりで辿る英単語アプリ。

英単語・英熟語を語根・接頭辞・接尾辞や意味のネットワークとして結び、関連する単語へ次々と辿りながら学べます。
FSRS による記憶定着、音声読み上げ、学習分析、AI 連携（任意）を備えた Web アプリです。

公開ページ: https://masakiniwa.github.io/Neuron-English-Vocabulary/

## 技術スタック

| 領域 | 採用技術 |
|---|---|
| ビルド | Vite + TypeScript |
| UI | React, Tailwind CSS v4, Radix UI, lucide-react |
| ルーティング | TanStack Router（ハッシュ履歴 / View Transitions） |
| 状態 | Zustand（設定）, Dexie.js / IndexedDB（履歴・学習データ） |
| 学習 | ts-fsrs |
| 検索 | MiniSearch（Web Worker + Comlink） |
| ネットワーク図 | Sigma.js（WebGL）, Graphology, ForceAtlas2（Web Worker） |
| 多言語 | i18next（現在は日本語のみ。`src/locales` に追加して拡張） |
| PWA | vite-plugin-pwa |
| テスト / CI | Vitest, GitHub Actions → GitHub Pages |

## ディレクトリ構成

```
src/
  app/          ルーター・レイアウト・ナビゲーション定義
  components/   共通 UI 部品
  features/     機能ごとのページ（home / words / network / study / analytics / ai / settings / help）
  lib/          DB・i18n・音声・テーマなどの基盤
  locales/      UI 翻訳リソース
  stores/       Zustand ストア
scripts/        単語データ生成スクリプト
public/data/    生成済み単語データ（CC BY-SA 4.0）
```

## 開発

```bash
npm install
npm run dev        # 開発サーバー
npm run typecheck  # 型チェック
npm test           # テスト
npm run build      # 本番ビルド（dist/）
```

`main` への push で GitHub Actions が GitHub Pages にデプロイします。

## ライセンス

- ソースコード: [MIT License](LICENSE)
- 単語データ（`public/data/` および `data/`）: [CC BY-SA 4.0](data/LICENSE.md)
  - NGSL, wordfreq, Wiktionary (CC BY-SA 4.0)、Tatoeba (CC BY 2.0 FR) を加工したもの
- 利用ライブラリのライセンスはビルド時に自動収集され、アプリのヘルプページに表示されます。
