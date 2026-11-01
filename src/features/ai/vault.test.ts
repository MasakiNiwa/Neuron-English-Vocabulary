import { describe, expect, it } from 'vitest'
import { getSecret, lock, putSecret, setupPassphrase, unlockWithPassphrase, isUnlocked } from './vault'

describe('vault', () => {
  it('encrypts secrets with a shared passphrase', async () => {
    await setupPassphrase('correct horse')
    await putSecret('k1', 'sk-test-123')
    await putSecret('k2', 'AIza-test')
    lock()
    expect(isUnlocked()).toBe(false)
    await expect(getSecret('k1')).rejects.toThrow()
    await expect(unlockWithPassphrase('wrong pass')).rejects.toThrow('パスフレーズが違います')
    await unlockWithPassphrase('correct horse')
    expect(await getSecret('k1')).toBe('sk-test-123')
    expect(await getSecret('k2')).toBe('AIza-test')
  }, 20000)
})
