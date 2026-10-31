/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import license from 'rollup-plugin-license'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
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
            options: { cacheName: 'nev-data', expiration: { maxEntries: 200 } },
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
