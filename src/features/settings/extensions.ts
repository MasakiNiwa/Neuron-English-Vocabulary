import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import type { TKey } from '@/lib/i18n'

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

export const settingsExtensions: SettingsExtension[] = []
