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

  it('すでに設定済みの保管庫を、別の初期設定で上書きしない（レビュー 2026-11-07 の 04）', async () => {
    // 上のテストで設定済み。古い初期設定画面から送信しても、最初のパスフレーズと秘密が使えるまま
    lock()
    await expect(setupPassphrase('another pass')).rejects.toThrow('すでに設定')
    await unlockWithPassphrase('correct horse')
    expect(await getSecret('k1')).toBe('sk-test-123')
  }, 20000)
})
