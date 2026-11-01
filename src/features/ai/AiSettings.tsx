import { Fingerprint, ListChecks, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { selectClass } from '@/components/ui/Form'
import { PROVIDERS, TASKS, useAiConfig, type ApiKeyEntry, type ProviderId } from './config'
import { usePersonas } from './personas'
import { ModelPicker } from './ModelPicker'
import { inputClass, UnlockPanel } from './UnlockPanel'
import { useVault } from './useVault'
import { changePassphrase, deleteSecret, putSecret, registerPasskey, removePasskeys, resetVault, webauthnSupported } from './vault'

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function AddKeyForm({ onDone }: { onDone: () => void }) {
  const add = useAiConfig((s) => s.addKey)
  const [provider, setProvider] = useState<ProviderId>('anthropic')
  const [label, setLabel] = useState('')
  const [secret, setSecret] = useState('')
  const [err, setErr] = useState('')
  return (
    <form
      className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          const id = crypto.randomUUID()
          await putSecret(id, secret.trim())
          add({ id, provider, label: label || PROVIDERS[provider].name, models: [PROVIDERS[provider].suggested[0]] })
          onDone()
        } catch (er) {
          setErr(String(er))
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        <select className={selectClass} value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
          {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDERS[p].name}
            </option>
          ))}
        </select>
        <input className={inputClass + ' flex-1'} placeholder="表示名（例: 個人用）" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <input type="password" className={inputClass} placeholder="API キー" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
      <p className="text-xs text-muted">
        キーの取得:{' '}
        <a href={PROVIDERS[provider].keyUrl} target="_blank" rel="noreferrer" className="text-accent underline">
          {PROVIDERS[provider].keyUrl}
        </a>
      </p>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!secret.trim()}>
          保存（暗号化）
        </Button>
        <Button size="sm" onClick={onDone}>
          キャンセル
        </Button>
      </div>
    </form>
  )
}

function KeyCard({ k }: { k: ApiKeyEntry }) {
  const update = useAiConfig((s) => s.updateKey)
  const remove = useAiConfig((s) => s.removeKey)
  const [picking, setPicking] = useState(false)
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-surface-2 px-1.5 text-xs text-muted">{PROVIDERS[k.provider].name}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{k.label}</span>
        <button
          type="button"
          aria-label="削除"
          className="text-muted hover:text-danger"
          onClick={async () => {
            if (!confirm(`「${k.label}」を削除しますか？`)) return
            await deleteSecret(k.id)
            remove(k.id)
          }}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {k.models.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {k.models.map((m) => (
            <span key={m} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-accent-soft px-2 py-0.5 text-xs text-accent">
              <span className="truncate">{m}</span>
              <button type="button" aria-label="外す" onClick={() => update(k.id, { models: k.models.filter((x) => x !== m) })}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-xs text-muted">モデルが選択されていません</p>
      )}
      <Button size="sm" className="w-full" onClick={() => setPicking(true)}>
        <ListChecks className="size-4" /> モデルを選択（{k.models.length}）
      </Button>
      <ModelPicker apiKey={k} open={picking} onOpenChange={setPicking} />
    </div>
  )
}

function Routing() {
  const { keys, routes, setRoute } = useAiConfig()
  const conns = keys.flatMap((k) => k.models.map((m) => ({ value: `${k.id}|${m}`, label: `${PROVIDERS[k.provider].name.split(' (')[0]} / ${k.label} / ${m}` })))
  if (!conns.length) return <p className="text-sm text-muted">API キーとモデルを登録すると設定できます。</p>
  return (
    <div className="flex flex-col gap-2">
      {TASKS.map((t) => {
        const r = routes[t.id]
        return (
          <div key={t.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <div className="sm:w-40">
              <div className="text-sm">{t.label}</div>
              <div className="text-[11px] text-muted">{t.hint}</div>
            </div>
            <select
              className={selectClass + ' w-full max-w-none sm:flex-1'}
              value={r ? `${r.keyId}|${r.model}` : ''}
              onChange={(e) => {
                const [keyId, ...rest] = e.target.value.split('|')
                setRoute(t.id, e.target.value ? { keyId, model: rest.join('|') } : undefined)
              }}
            >
              <option value="">{t.id === 'chat' ? '自動（最初に登録したモデル）' : 'チャットと同じ'}</option>
              {conns.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )
      })}
    </div>
  )
}

function CustomPersonaEditor() {
  const custom = useAiConfig((s) => s.custom)
  const setCustom = useAiConfig((s) => s.setCustom)
  const [draft, setDraft] = useState(custom ?? { name: '', emoji: '✨', role: '', style: '' })
  const [saved, setSaved] = useState(false)
  const field = (k: keyof typeof draft, label: string, placeholder: string, multiline = false) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted">{label}</span>
      {multiline ? (
        <textarea className={inputClass + ' h-16 py-2'} value={draft[k]} placeholder={placeholder} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
      ) : (
        <input className={inputClass} value={draft[k]} placeholder={placeholder} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
      )}
    </label>
  )
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
      <div className="text-sm font-medium">カスタムキャラクター（1人）</div>
      <div className="grid grid-cols-[4rem_1fr] gap-2">
        {field('emoji', 'アイコン', '✨')}
        {field('name', '名前', '例: ジョン先生')}
      </div>
      {field('role', '役割', '例: ロンドン出身の陽気な英語ネイティブ')}
      {field('style', '話し方・性格', '例: 英語のフレーズを交えて楽しく話す。発音やネイティブの感覚を教えてくれる。', true)}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!draft.name.trim()}
          onClick={() => {
            setCustom({ ...draft, name: draft.name.trim().slice(0, 20) })
            setSaved(true)
            setTimeout(() => setSaved(false), 1500)
          }}
        >
          {saved ? '保存しました' : '保存'}
        </Button>
        {custom && (
          <Button
            size="sm"
            onClick={() => {
              setCustom(null)
              setDraft({ name: '', emoji: '✨', role: '', style: '' })
            }}
          >
            削除
          </Button>
        )}
      </div>
    </div>
  )
}

function Cast() {
  const { cast, setCast } = useAiConfig()
  const personas = usePersonas()
  return (
    <div className="flex flex-col gap-1.5">
      {personas.map((p) => {
        const on = cast.includes(p.id)
        return (
          <label key={p.id} className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 hover:bg-surface-2">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[var(--accent)]"
              checked={on}
              onChange={() => setCast(on ? cast.filter((x) => x !== p.id) : [...cast, p.id].slice(-3))}
            />
            <span className="text-lg leading-none">{p.emoji}</span>
            <span>
              <span className="text-sm font-medium">{p.name}</span>
              <span className="block text-xs text-muted">{p.role}</span>
            </span>
          </label>
        )
      })}
      <p className="text-xs text-muted">最大 3 人まで。複数選ぶとキャラクター同士の掛け合いになります。</p>
      <CustomPersonaEditor />
    </div>
  )
}

export function AiSettings() {
  const v = useVault()
  const keys = useAiConfig((s) => s.keys)
  const reaction = useAiConfig((s) => s.reactionAfterStudy)
  const setCfg = useAiConfig((s) => s.set)
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <div>
      <p className="mb-4 text-xs leading-relaxed text-muted">
        AI はなくてもアプリは使えます。API キーを登録すると、AI チャット、単語の解説、学習後のリアクションが使えるようになります。API キーは端末内に暗号化して保存され、各 AI サービスへ直接送信されます。
      </p>
      <Sub title="ロック">
        <UnlockPanel />
        {v.unlocked && webauthnSupported() && (
          <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Fingerprint className="size-4 shrink-0" />
              <span className="flex-1">
                生体認証：{v.passkeys ? <span className="text-success">登録済み</span> : <span className="text-muted">未登録</span>}
              </span>
              {v.passkeys > 0 && (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!confirm('生体認証の登録を解除しますか？（パスフレーズでのロック解除はそのまま使えます）')) return
                    await removePasskeys()
                    v.refresh()
                    setMsg('生体認証の登録を解除しました')
                  }}
                >
                  解除
                </Button>
              )}
            </div>
            {v.passkeys === 0 ? (
              <Button
                size="sm"
                variant="primary"
                className="mt-2"
                onClick={async () => {
                  setMsg('')
                  try {
                    await registerPasskey()
                    v.refresh()
                    setMsg('生体認証（パスキー）を登録しました。次回から指紋・顔認証などでロックを解除できます')
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : String(e))
                  }
                }}
              >
                <Fingerprint className="size-4" /> 生体認証を登録
              </Button>
            ) : (
              <p className="mt-1.5 text-xs leading-relaxed text-muted">この端末のこのブラウザで、指紋・顔認証などでロックを解除できます。</p>
            )}
          </div>
        )}
        {v.unlocked && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={async () => {
                const p = prompt('新しいパスフレーズ（6文字以上）')
                if (p && p.length >= 6) {
                  await changePassphrase(p)
                  setMsg('パスフレーズを変更しました')
                }
              }}
            >
              パスフレーズを変更
            </Button>
          </div>
        )}
        {v.initialized && (
          <button
            type="button"
            className="mt-3 text-xs text-muted underline hover:text-danger"
            onClick={async () => {
              if (confirm('保管庫を初期化すると、保存した全ての API キーが削除されます。よろしいですか？')) {
                await resetVault()
                keys.forEach((k) => useAiConfig.getState().removeKey(k.id))
                v.refresh()
              }
            }}
          >
            パスフレーズを忘れた場合: 保管庫を初期化
          </button>
        )}
        {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
      </Sub>
      {v.unlocked && (
        <Sub title="API キーとモデル">
          <div className="flex flex-col gap-2">
            {keys.map((k) => (
              <KeyCard key={k.id} k={k} />
            ))}
            {adding ? (
              <AddKeyForm onDone={() => setAdding(false)} />
            ) : (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> API キーを追加
              </Button>
            )}
          </div>
        </Sub>
      )}
      <Sub title="用途ごとのモデル割り当て">
        <Routing />
      </Sub>
      <Sub title="キャラクター">
        <Cast />
      </Sub>
      <Sub title="その他">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={reaction} onChange={(e) => setCfg({ reactionAfterStudy: e.target.checked })} />
          学習セッションの後に AI がひとことコメントする
        </label>
      </Sub>
    </div>
  )
}
