import { BarChart3, BookOpen, Bot, GraduationCap, Home, Network, Settings, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: '/' | '/words' | '/network' | '/study' | '/analytics' | '/ai' | '/settings'
  labelKey: `nav.${'home' | 'words' | 'network' | 'study' | 'analytics' | 'ai' | 'settings'}`
  icon: LucideIcon
}

/** ナビゲーション項目（ここに追加するだけでスマホ下部バー・PC サイドバー両方に反映される。上限 7 程度） */
export const navItems: NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: Home },
  { to: '/words', labelKey: 'nav.words', icon: BookOpen },
  { to: '/network', labelKey: 'nav.network', icon: Network },
  { to: '/study', labelKey: 'nav.study', icon: GraduationCap },
  { to: '/analytics', labelKey: 'nav.analytics', icon: BarChart3 },
  { to: '/ai', labelKey: 'nav.ai', icon: Bot },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
]
