import * as Comlink from 'comlink'
import type { SearchApi, SearchFilter, SearchHit } from './search.worker'

export type { SearchFilter, SearchHit }

let api: Comlink.Remote<SearchApi> | null = null
let initP: Promise<void> | null = null

function getApi() {
  if (!api) {
    const worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
    api = Comlink.wrap<SearchApi>(worker)
  }
  if (!initP) {
    const p = api.init(document.baseURI)
    // 索引の取得に失敗したら忘れて、次の検索で初期化し直す（レビュー 2026-11-07 の 07）
    p.catch(() => {
      if (initP === p) initP = null
    })
    initP = p
  }
  return api
}

/** 検索する。索引を取得できなかったときは例外（呼び出し側で「再試行」を出す） */
export async function searchDictionary(q: string, filter: SearchFilter = 'all'): Promise<SearchHit[]> {
  const a = getApi()
  await initP
  return a.search(q, filter)
}

/** アプリ起動直後のアイドル時に索引構築を始めておく */
export function warmupSearch() {
  const run = () => void getApi()
  if ('requestIdleCallback' in window) requestIdleCallback(run)
  else setTimeout(run, 500)
}
