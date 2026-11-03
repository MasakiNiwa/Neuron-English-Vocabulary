import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAiConfig } from './config'

/**
 * 使うモデルの表示と切り替え（チャット・単語ページの「AI に聞く」で共通。設定の「使用するモデル」と同じ値）。
 * モデルが 1 つだけのときは切り替えずに表示だけする。
 */
export function ModelSelect({ className }: { className?: string }) {
  const { keys, route, setRoute } = useAiConfig()
  const options = keys.flatMap((k) => k.models.map((m) => ({ value: `${k.id}|${m}`, model: m })))
  if (!options.length) return null
  const valid = route && options.some((o) => o.value === `${route.keyId}|${route.model}`)
  const value = valid ? `${route.keyId}|${route.model}` : options[0].value
  const current = options.find((o) => o.value === value)!
  return (
    <label
      className={cn(
        'relative inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg focus-within:bg-surface-2 focus-within:text-fg',
        className,
      )}
      title="使用するモデル"
    >
      {/* 見た目は文字だけにして、実際の選択は透明な select に任せる（スマホでも標準の選択画面が出る） */}
      <span className="min-w-0 truncate">{current.model}</span>
      {options.length > 1 && <ChevronDown className="size-3.5 shrink-0" />}
      {options.length > 1 && (
        <select
          aria-label="使用するモデル"
          value={value}
          onChange={(e) => {
            const [keyId, ...rest] = e.target.value.split('|')
            setRoute({ keyId, model: rest.join('|') })
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {keys.map((k) => (
            <optgroup key={k.id} label={k.label}>
              {k.models.map((m) => (
                <option key={m} value={`${k.id}|${m}`}>
                  {m}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
    </label>
  )
}
