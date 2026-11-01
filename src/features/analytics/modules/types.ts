import type { ComponentType } from 'react'
import type { AnalyticsResult } from '../compute'

export interface Drill {
  title: string
  keys: string[]
  morph?: string
}

export interface ModuleProps {
  data: AnalyticsResult
  onDrill: (d: Drill) => void
}

/**
 * 分析ツールのプラグイン定義。
 * modules/index.ts の analyticsModules に追加するだけで分析ページに表示される。
 */
export interface AnalyticsModule {
  id: string
  title: string
  description: string
  Component: ComponentType<ModuleProps>
}
