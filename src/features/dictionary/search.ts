import * as Comlink from 'comlink'
import type { SearchApi, SearchFilter, SearchHit } from './search.worker'

export type { SearchFilter, SearchHit }

let api: Comlink.Remote<SearchApi> | null = null
let initP: Promise<void> | null = null

function getApi() {
  if (!api) {
    const worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
    api = Comlink.wrap<SearchApi>(worker)
    initP = api.init(document.baseURI)
  }
  return api
}

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
