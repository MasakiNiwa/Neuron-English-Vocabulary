// Real Chromium regression checks for the browser-only export pipeline.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4179'], { stdio: 'inherit' })
let browser
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch('http://127.0.0.1:4179')).ok) break } catch {}
    if (i >= 100) throw new Error('Vite did not start')
    await new Promise((r) => setTimeout(r, 100))
  }
  browser = await chromium.launch()
  await mkdir('test-results/screenshots', { recursive: true })
  for (const width of [360, 412, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 915 }, deviceScaleFactor: 2.625 })
    await page.goto('http://127.0.0.1:4179/#/e/train')
    await page.getByRole('heading', { name: 'train', exact: true }).waitFor()
    await page.locator('[data-screenshot-word-pair]').first().waitFor()
    // Let dictionary/history data finish before comparing repeated exports.
    await page.waitForLoadState('networkidle')
    for (const chrome of [true, false]) {
      await page.evaluate(async (chrome) => {
        const { useSettings } = await import('/src/stores/settings.ts')
        useSettings.setState({ screenshotChrome: chrome })
      }, chrome)
      let previous
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await page.evaluate(async () => {
          const { capturePage } = await import('/src/lib/screenshot.ts')
          const before = [...document.querySelectorAll('#app-shell, #app-shell *')].map((el) => el.getAttribute('style'))
          const blob = await capturePage('png')
          const after = [...document.querySelectorAll('#app-shell, #app-shell *')].map((el) => el.getAttribute('style'))
          const bitmap = await createImageBitmap(blob)
          const dimensions = [bitmap.width, bitmap.height]
          bitmap.close()
          return { bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), dimensions, restored: JSON.stringify(before) === JSON.stringify(after), capturing: document.documentElement.classList.contains('nev-capturing') }
        })
        assert(result.restored, 'Inline styles must be restored')
        assert(!result.capturing, 'Capture class must be removed')
        assert(result.dimensions[1] > 915, 'Export must include content below the viewport')
        const bytes = Buffer.from(result.bytes)
        if (previous) assert(bytes.equals(previous), `Non-deterministic export at ${width}px, chrome=${chrome}`)
        previous = bytes
        if (attempt === 2) await writeFile(`test-results/screenshots/train-${width}-${chrome ? 'chrome' : 'content'}.png`, bytes)
      }
    }
    // Extremely long content must still fit the documented canvas limits.
    const long = await page.evaluate(async () => {
      const extra = document.createElement('div')
      extra.style.height = '70000px'
      extra.textContent = 'Long screenshot regression fixture'
      document.querySelector('main').append(extra)
      try {
        const { capturePage } = await import('/src/lib/screenshot.ts')
        const bitmap = await createImageBitmap(await capturePage('webp'))
        const dimensions = [bitmap.width, bitmap.height]
        bitmap.close()
        return dimensions
      } finally { extra.remove() }
    })
    assert(long[0] * long[1] <= 16000000)
    assert(Math.max(...long) <= 32000)
    console.log(`PASS: ${width}px, 6 identical/restored PNG exports and long WebP canvas limits`)
    await page.close()
  }
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
