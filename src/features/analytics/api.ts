import * as Comlink from 'comlink'
import { useSettings } from '@/stores/settings'
import type { AnalyticsApi } from './analytics.worker'
import type { AnalyticsResult } from './compute'

/** 分析の集計をする Worker（分析ページと、AI に渡す学習のまとめで共有する） */
let api: Comlink.Remote<AnalyticsApi> | null = null
function getApi() {
  api ??= Comlink.wrap<AnalyticsApi>(new Worker(new URL('./analytics.worker.ts', import.meta.url), { type: 'module' }))
  return api
}

export function runAnalytics(): Promise<AnalyticsResult> {
  const s = useSettings.getState()
  return getApi().run(document.baseURI, s.desiredRetention, !s.showSensitive)
}
