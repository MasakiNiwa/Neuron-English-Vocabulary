import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { isInitialized, isUnlocked, passkeyCount, subscribeVault } from './vault'

export function useVault() {
  const unlocked = useSyncExternalStore(subscribeVault, isUnlocked, () => false)
  const [info, setInfo] = useState<{ initialized: boolean; passkeys: number } | null>(null)
  const refresh = useCallback(() => {
    void Promise.all([isInitialized(), passkeyCount()]).then(([initialized, passkeys]) => setInfo({ initialized, passkeys }))
  }, [])
  useEffect(refresh, [refresh, unlocked])
  return { unlocked, initialized: info?.initialized, passkey: !!info?.passkeys, passkeys: info?.passkeys ?? 0, refresh }
}
