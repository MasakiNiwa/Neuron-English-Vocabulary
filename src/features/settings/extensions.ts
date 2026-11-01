import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import type { TKey } from '@/lib/i18n'
import { Bot, ExternalLink } from 'lucide-react'
import { lazy } from 'react'

/**
 * 設定ページに機能ごとのセクションを差し込むための登録口。
 * 機能（AI など）を追加したら、ここに 1 行追加するだけで設定ページに折りたたみセクションが増える。
 */
export interface SettingsExtension {
  id: string
  titleKey: TKey
  icon: LucideIcon
  Component: ComponentType
}

export const settingsExtensions: SettingsExtension[] = [
  {
    id: 'ai',
    titleKey: 'settings.ai',
    icon: Bot,
    Component: lazy(() => import('@/features/ai/AiSettings').then((m) => ({ default: m.AiSettings }))),
  },
  {
    id: 'external-ai',
    titleKey: 'settings.externalAi',
    icon: ExternalLink,
    Component: lazy(() => import('@/features/ai/ExternalAiSettings').then((m) => ({ default: m.ExternalAiSettings }))),
  },
]
