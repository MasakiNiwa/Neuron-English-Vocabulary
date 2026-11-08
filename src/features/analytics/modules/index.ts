import { ActivityModule } from './ActivityModule'
import { CoverageModule } from './CoverageModule'
import { HabitModule } from './HabitModule'
import { MemoryModule } from './MemoryModule'
import { RootsModule } from './RootsModule'
import type { AnalyticsModule } from './types'

/** 分析ツールの一覧（ここに追加すると分析ページに表示される） */
export const analyticsModules: AnalyticsModule[] = [
  { id: 'memory', title: '記憶の見通し', description: '今後の復習予定と、今思い出せる見込み（FSRS による推定）。棒をタップするとその単語を表示', Component: MemoryModule },
  { id: 'roots', title: '語根の広がり', description: '語根ごとに「見た・学習中・日をあけて思い出せた」語。タップでまだ学習していない語を表示', Component: RootsModule },
  { id: 'coverage', title: '頻度帯カバー率', description: '頻度順位の帯ごとに、触れた単語の割合', Component: CoverageModule },
  { id: 'habit', title: '学習習慣とつまずき', description: '時間帯別の活動量と、最近つまずいた単語', Component: HabitModule },
  { id: 'activity', title: '学習カレンダー', description: '日ごとの閲覧・回答数。日付をタップするとその日の単語を表示', Component: ActivityModule },
]
