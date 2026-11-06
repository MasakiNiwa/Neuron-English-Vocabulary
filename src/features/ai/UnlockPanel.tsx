import { Fingerprint, KeyRound, Lock, Unlock } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useVault } from './useVault'
import { lock, setupPassphrase, unlockWithPasskey, unlockWithPassphrase, webauthnSupported } from './vault'

export const inputClass =
  'h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent'

/** パスフレーズ / 生体認証でのロック解除（初回はパスフレーズの設定） */
export function UnlockPanel({ compact }: { compact?: boolean }) {
  const v = useVault()
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>) => {
    setErr('')
    setBusy(true)
    try {
      await fn()
      setPass('')
      setPass2('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      // 別のタブで保管庫が作られていた場合などに、設定画面から解除画面へ切り替える
      v.refresh()
    }
  }
  if (v.initialized === undefined) return null
  if (v.unlocked)
    return (
      <div className="flex items-center gap-2 text-sm">
        <Unlock className="size-4 text-success" />
        <span className="flex-1">ロック解除中（60分操作がないと自動でロック）</span>
        <Button size="sm" onClick={lock}>
          <Lock className="size-4" /> ロック
        </Button>
      </div>
    )
  if (!v.initialized)
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (pass !== pass2) return setErr('パスフレーズが一致しません')
          void run(() => setupPassphrase(pass))
        }}
      >
        <p className="text-sm text-muted">
          API キーを暗号化するパスフレーズを設定します。すべての AI の API キーがこの 1 つのパスフレーズで保護されます（忘れると復元できません）。
        </p>
        <input type="password" className={inputClass} placeholder="パスフレーズ（6文字以上）" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
        <input type="password" className={inputClass} placeholder="もう一度入力" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
        {err && <p className="text-sm text-danger">{err}</p>}
        <Button variant="primary" type="submit" disabled={busy || !pass}>
          <KeyRound className="size-4" /> パスフレーズを設定
        </Button>
      </form>
    )
  return (
    <form
      className={'flex flex-col gap-2 ' + (compact ? '' : '')}
      onSubmit={(e) => {
        e.preventDefault()
        void run(() => unlockWithPassphrase(pass))
      }}
    >
      <div className="flex gap-2">
        <input type="password" className={inputClass} placeholder="パスフレーズ" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
        <Button variant="primary" type="submit" className="shrink-0 whitespace-nowrap" disabled={busy || !pass}>
          <Unlock className="size-4" /> 解除
        </Button>
      </div>
      {v.passkey && webauthnSupported() && (
        <Button type="button" disabled={busy} onClick={() => void run(unlockWithPasskey)}>
          <Fingerprint className="size-4" /> 生体認証で解除
        </Button>
      )}
      {err && <p className="text-sm text-danger">{err}</p>}
    </form>
  )
}
