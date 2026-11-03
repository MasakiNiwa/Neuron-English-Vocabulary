# ニューロン英単語 (Neuron English Vocabulary)

語源や意味のつながりで辿る英単語アプリ。

英単語・英熟語を語根・接頭辞・接尾辞や意味のネットワークとして結び、関連する単語へ次々と辿りながら学べます。
FSRS による記憶定着、音声読み上げ、学習分析、AI 連携（任意）を備えた Web アプリです。

公開ページ: https://masakiniwa.github.io/Neuron-English-Vocabulary/

## 作った理由

ずっと、落ちこぼれだった\
本当に、ずっと

単語帳で英単語を覚えるのが、致命的に苦手だった\
意味が分からない反復作業

そんな英単語で唯一面白いと思えたのが、語源でした

語源連想方式で学べれば、楽しみながら学べる

あの頃の言い訳を、AIにアプリにしてもらいました

落ちこぼれの、\
落ちこぼれによる、\
落ちこぼれのための、英単語アプリです

## 技術スタック

| 領域 | 採用技術 |
|---|---|
| ビルド | Vite + TypeScript |
| UI | React, Tailwind CSS v4, Radix UI, lucide-react |
| ルーティング | TanStack Router（ハッシュ履歴 / View Transitions） |
| 状態 | Zustand（設定）, Dexie.js / IndexedDB（履歴・学習データ） |
| 学習 | ts-fsrs |
| 検索 | MiniSearch（Web Worker + Comlink） |
| 分析 | Apache ECharts（集計は Web Worker） |
| AI | Anthropic SDK（Claude）、OpenAI / Gemini / OpenRouter の REST API、Web Crypto + WebAuthn PRF によるキー暗号化 |
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

## 今後の予定

改善の予定は [docs/ROADMAP.md](docs/ROADMAP.md) にまとめています。

## ライセンス

- ソースコード: [MIT License](LICENSE)
- 単語データ（`public/data/` および `data/`）: [CC BY-SA 4.0](data/LICENSE.md)
  - NGSL, wordfreq, Wiktionary (CC BY-SA 4.0)、Tatoeba (CC BY 2.0 FR) を加工したもの
- 利用ライブラリのライセンスはビルド時に自動収集され、アプリのヘルプページに表示されます。
