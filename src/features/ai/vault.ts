import { db, kvGet, kvSet } from '@/lib/db'

/**
 * API キーの暗号化保管庫（Web Crypto API + WebAuthn PRF）
 *
 * 仕組み:
 *  - ランダムなデータ鍵 (DEK, AES-GCM 256bit) で全ての API キーを暗号化する
 *  - DEK は「パスフレーズから PBKDF2 で導出した鍵」で暗号化して保存する
 *  - パスキー（生体認証）を登録すると、WebAuthn の PRF 拡張から得た秘密値でも DEK を暗号化して保存する
 *  - したがって 1 回のロック解除（パスフレーズ or 生体認証）で全ての API キーが使える
 *  - DEK はロック解除中のみメモリ上に保持し、一定時間操作がないと破棄する
 */

const PBKDF2_ITER = 600_000
const enc = new TextEncoder()
const dec = new TextDecoder()

interface WrappedKey {
  iv: Uint8Array
  data: ArrayBuffer
}
interface PasskeyRecord {
  credentialId: string
  prfSalt: Uint8Array
  wrapped: WrappedKey
  createdAt: number
}
interface VaultMeta {
  salt: Uint8Array
  iterations: number
  byPassphrase: WrappedKey
  passkeys: PasskeyRecord[]
}

let dekRaw: Uint8Array | null = null
let dekKey: CryptoKey | null = null
let lockTimer: number | undefined
const listeners = new Set<() => void>()
export const AUTO_LOCK_MS = 30 * 60 * 1000

function emit() {
  listeners.forEach((l) => l())
}
export function subscribeVault(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function aesKey(raw: Uint8Array) {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
async function encrypt(key: CryptoKey, data: Uint8Array): Promise<WrappedKey> {
  const iv = rand(12)
  return { iv, data: await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource) }
}
async function decrypt(key: CryptoKey, w: WrappedKey) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: w.iv as BufferSource }, key, w.data))
}

async function passphraseKey(pass: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function prfKey(prfOutput: ArrayBuffer) {
  const base = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('neuron-vault'), info: enc.encode('dek-wrap') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

const getMeta = () => kvGet<VaultMeta>('vault')
const setMeta = (m: VaultMeta) => kvSet('vault', m)

async function setUnlocked(raw: Uint8Array) {
  dekRaw = raw
  dekKey = await aesKey(raw)
  touch()
  emit()
}

/** 操作のたびに自動ロックのタイマーを延長 */
export function touch() {
  window.clearTimeout(lockTimer)
  lockTimer = window.setTimeout(lock, AUTO_LOCK_MS)
}

export function lock() {
  dekRaw = null
  dekKey = null
  window.clearTimeout(lockTimer)
  emit()
}

export const isUnlocked = () => dekKey !== null
export async function isInitialized() {
  return !!(await getMeta())
}
export async function hasPasskey() {
  return !!(await getMeta())?.passkeys.length
}

export async function setupPassphrase(pass: string) {
  if (pass.length < 6) throw new Error('パスフレーズは 6 文字以上にしてください')
  const salt = rand(16)
  const raw = rand(32)
  const key = await passphraseKey(pass, salt, PBKDF2_ITER)
  await setMeta({ salt, iterations: PBKDF2_ITER, byPassphrase: await encrypt(key, raw), passkeys: [] })
  await setUnlocked(raw)
}

export async function unlockWithPassphrase(pass: string) {
  const meta = await getMeta()
  if (!meta) throw new Error('保管庫が未設定です')
  try {
    const key = await passphraseKey(pass, meta.salt, meta.iterations)
    await setUnlocked(await decrypt(key, meta.byPassphrase))
  } catch {
    throw new Error('パスフレーズが違います')
  }
}

export async function changePassphrase(newPass: string) {
  if (!dekRaw) throw new Error('ロックを解除してください')
  const meta = (await getMeta())!
  const salt = rand(16)
  const key = await passphraseKey(newPass, salt, PBKDF2_ITER)
  await setMeta({ ...meta, salt, iterations: PBKDF2_ITER, byPassphrase: await encrypt(key, dekRaw) })
}

/** 保管庫と全ての API キーを削除（パスフレーズを忘れた場合など） */
export async function resetVault() {
  lock()
  await db.kv.delete('vault')
  await db.secrets.clear()
}

// ---------------------------------------------------------------- 秘密情報

export async function putSecret(id: string, plaintext: string) {
  if (!dekKey) throw new Error('ロックされています')
  touch()
  const w = await encrypt(dekKey, enc.encode(plaintext))
  await db.secrets.put({ id, iv: w.iv, data: w.data })
}

export async function getSecret(id: string): Promise<string | null> {
  if (!dekKey) throw new Error('ロックされています')
  touch()
  const r = await db.secrets.get(id)
  if (!r) return null
  return dec.decode(await decrypt(dekKey, { iv: r.iv, data: r.data }))
}

export async function deleteSecret(id: string) {
  await db.secrets.delete(id)
}

// ---------------------------------------------------------------- WebAuthn（生体認証）

export const webauthnSupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }

/** パスキーを登録し、PRF 拡張の出力で DEK を暗号化して保存 */
export async function registerPasskey() {
  if (!dekRaw) throw new Error('先にパスフレーズでロックを解除してください')
  const meta = (await getMeta())!
  const prfSalt = rand(32)
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rand(32) as BufferSource,
      rp: { name: 'ニューロン英単語' },
      user: { id: rand(16) as BufferSource, name: 'neuron-vocab-user', displayName: 'ニューロン英単語' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      extensions: { prf: { eval: { first: prfSalt as BufferSource } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('登録がキャンセルされました')
  const ext = cred.getClientExtensionResults() as PrfResults
  if (!ext.prf?.enabled && !ext.prf?.results?.first) {
    throw new Error('この端末・ブラウザのパスキーは PRF 拡張に対応していないため、生体認証によるロック解除は使えません')
  }
  const credentialId = b64(cred.rawId)
  // 登録時に PRF の結果が返らない認証器もあるので、その場合は一度認証して取得する
  const prf = ext.prf.results?.first ?? (await evalPrf([{ credentialId, prfSalt }])).prf
  const key = await prfKey(prf)
  await setMeta({
    ...meta,
    passkeys: [...meta.passkeys, { credentialId, prfSalt, wrapped: await encrypt(key, dekRaw), createdAt: Date.now() }],
  })
}

async function evalPrf(list: { credentialId: string; prfSalt: Uint8Array }[]) {
  const evalByCredential: Record<string, { first: BufferSource }> = {}
  for (const p of list) evalByCredential[p.credentialId.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')] = { first: p.prfSalt as BufferSource }
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: rand(32) as BufferSource,
      allowCredentials: list.map((p) => ({ type: 'public-key' as const, id: unb64(p.credentialId) as BufferSource })),
      userVerification: 'required',
      extensions: { prf: { evalByCredential } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!assertion) throw new Error('認証がキャンセルされました')
  const first = (assertion.getClientExtensionResults() as PrfResults).prf?.results?.first
  if (!first) throw new Error('PRF の結果を取得できませんでした')
  return { prf: first, credentialId: b64(assertion.rawId) }
}

export async function unlockWithPasskey() {
  const meta = await getMeta()
  if (!meta?.passkeys.length) throw new Error('パスキーが登録されていません')
  const { prf, credentialId } = await evalPrf(meta.passkeys)
  const rec = meta.passkeys.find((p) => p.credentialId === credentialId) ?? meta.passkeys[0]
  await setUnlocked(await decrypt(await prfKey(prf), rec.wrapped))
}

export async function removePasskeys() {
  const meta = await getMeta()
  if (meta) await setMeta({ ...meta, passkeys: [] })
}
