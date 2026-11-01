import { ActivityModule } from './ActivityModule'
import { CoverageModule } from './CoverageModule'
import { HabitModule } from './HabitModule'
import { MemoryModule } from './MemoryModule'
import { RootsModule } from './RootsModule'
import type { AnalyticsModule } from './types'

/** 分析ツールの一覧（ここに追加すると分析ページに表示される） */
export const analyticsModules: AnalyticsModule[] = [
  { id: 'activity', title: '学習カレンダー', description: '日ごとの閲覧・回答数。日付をタップするとその日の単語を表示', Component: ActivityModule },
  { id: 'memory', title: '記憶の状態', description: 'FSRS によるカードの状態と想起確率', Component: MemoryModule },
  { id: 'coverage', title: '頻度帯カバー率', description: '頻度順位の帯ごとに、触れた単語の割合', Component: CoverageModule },
  { id: 'roots', title: '語根の攻略状況', description: '語根ごとに、含まれる単語をどれだけ見たか', Component: RootsModule },
  { id: 'habit', title: '学習習慣と苦手', description: '時間帯別の活動量と、間違えやすい単語', Component: HabitModule },
]
