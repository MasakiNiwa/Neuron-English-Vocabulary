/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import license from 'rollup-plugin-license'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

/**
 * 本番ビルドの index.html に Content-Security-Policy を入れる（開発サーバーは独自のスクリプトを差し込むので対象外）。
 * - スクリプト: 自分のファイルと、index.html のテーマ用インラインスクリプト（ハッシュで許可）だけ
 * - 通信先: 自分と、AI 連携の 4 社の API だけ（AI の回答に外部 URL が混ざっても、そこへは送られない）
 * - 画像: 自分と data:/blob: だけ（外部の画像は読み込まない）
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'nev-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
          .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
          .join(' ')
        const csp = [
          "default-src 'self'",
          `script-src 'self' ${hashes}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self' https://api.anthropic.com https://api.openai.com https://openrouter.ai https://generativelanguage.googleapis.com",
          "worker-src 'self' blob:",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ')
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
      },
    },
  }
}

export default defineConfig({
  // 相対パスにすることで GitHub Pages のサブパス (/Neuron-English-Vocabulary/) でもローカルでも動く
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __GIT_COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? gitCommit()),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  plugins: [
    contentSecurityPolicy(),
    react(),
    tailwindcss(),
    // 依存ライブラリのライセンス情報をビルド時に収集し、ヘルプページで表示する
    license({
      thirdParty: {
        includePrivate: false,
        output: {
          file: fileURLToPath(new URL('./dist/third-party-licenses.json', import.meta.url)),
          template(dependencies) {
            const list = dependencies
              .map((d) => ({
                name: d.name,
                version: d.version,
                license: d.license,
                author: typeof d.author === 'object' && d.author ? d.author.name : d.author,
                repository:
                  typeof d.repository === 'object' && d.repository ? d.repository.url : d.repository,
                homepage: d.homepage,
                licenseText: d.licenseText,
              }))
              .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
            return JSON.stringify(list)
          },
        },
      },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'ニューロン英単語',
        short_name: 'ニューロン英単語',
        description: '語源や意味のつながりで辿る英単語アプリ',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#121416',
        theme_color: '#121416',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'StaleWhileRevalidate',
            // 詳細データは ?v=<索引の版> 付きで取るので、版ごとに別のキャッシュになる（古い版は件数の上限で順に消える）
            options: { cacheName: 'nev-data', expiration: { maxEntries: 400 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
