import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { hasPasskey, isInitialized, isUnlocked, subscribeVault } from './vault'

export function useVault() {
  const unlocked = useSyncExternalStore(subscribeVault, isUnlocked, () => false)
  const [info, setInfo] = useState<{ initialized: boolean; passkey: boolean } | null>(null)
  const refresh = useCallback(() => {
    void Promise.all([isInitialized(), hasPasskey()]).then(([initialized, passkey]) => setInfo({ initialized, passkey }))
  }, [])
  useEffect(refresh, [refresh, unlocked])
  return { unlocked, initialized: info?.initialized, passkey: info?.passkey, refresh }
}
