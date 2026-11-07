import { Database, GraduationCap, Palette, Volume2 } from 'lucide-react'
import { countCachedShards, prefetchAllShards } from '@/features/dictionary/data'
import { Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionSection } from '@/components/ui/Accordion'
import { Button } from '@/components/ui/Button'
import { Page } from '@/components/ui/Page'
import { clearHistory, clearStudy } from '@/lib/db'
import { buildBackup, clearEverything, currentCounts, parseBackup, restoreBackup, TABLE_LABEL, BACKUP_TABLES, type BackupTable, type ParsedBackup } from './backup'
import { speak, ttsSupported, useEnglishVoices } from '@/lib/speech'
import { useSettings, type ThemeMode } from '@/stores/settings'
import { settingsExtensions } from './extensions'
import { Row, Segmented, selectClass } from '@/components/ui/Form'

function StorageInfo() {
  const [est, setEst] = useState<StorageEstimate | null>(null)
  useEffect(() => {
    void navigator.storage?.estimate?.().then(setEst)
  }, [])
  if (!est?.usage) return null
  const mb = (n = 0) => (n / 1024 / 1024).toFixed(1) + ' MB'
  return (
    <span className="text-sm text-muted">
      {mb(est.usage)} / {mb(est.quota)}
    </span>
  )
}

/** 辞書の詳細データをオフライン用にまとめて保存する（ROADMAP T01） */
function OfflinePrep() {
  const [state, setState] = useState<{ cached: number; total: number } | null | undefined>(undefined)
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [msg, setMsg] = useState('')
  const refresh = () => void countCachedShards().then(setState)
  useEffect(refresh, [])
  if (state === null) return <span className="text-xs text-muted">この環境ではオフライン保存を使えません</span>
  const complete = state && state.cached >= state.total
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={!!busy || complete}
        onClick={async () => {
          setMsg('')
          try {
            await prefetchAllShards((done, total) => setBusy({ done, total }))
            setMsg('保存しました')
          } catch (e) {
            setMsg(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`)
          } finally {
            setBusy(null)
            refresh()
            // Service Worker のキャッシュへの書き込みは少し遅れて終わるので、もう一度数え直す
            setTimeout(refresh, 1500)
          }
        }}
      >
        {busy ? `保存中… ${busy.done} / ${busy.total}` : complete ? '保存済み' : 'すべて保存'}
      </Button>
      {state && !busy && (
        <span className="text-[11px] text-muted">
          保存済み {state.cached} / {state.total}
          {msg && `（${msg}）`}
        </span>
      )}
    </div>
  )
}

function DangerButton({ label, action }: { label: string; action: () => Promise<void> }) {
  const { t } = useTranslation()
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="danger"
      size="sm"
      onClick={async () => {
        if (!confirm(t('settings.clearConfirm'))) return
        await action()
        setDone(true)
        setTimeout(() => setDone(false), 2000)
      }}
    >
      {done ? t('settings.cleared') : label}
    </Button>
  )
}


export function SettingsPage() {
  const { t } = useTranslation()
  const s = useSettings()
  const voices = useEnglishVoices()

  const [pending, setPending] = useState<ParsedBackup | null>(null)
  const [counts, setCounts] = useState<Record<BackupTable, number> | null>(null)
  const [importMsg, setImportMsg] = useState('')

  const doExport = async () => {
    const data = await buildBackup()
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `neuron-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const doImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setImportMsg('')
      try {
        const parsed = parseBackup(JSON.parse(await file.text()))
        setCounts(await currentCounts())
        setPending(parsed)
      } catch (e) {
        setPending(null)
        setImportMsg(e instanceof SyntaxError ? 'JSON として読み込めませんでした' : e instanceof Error ? e.message : String(e))
      }
    }
    input.click()
  }
  const doRestore = async (mode: 'replace' | 'merge') => {
    if (!pending) return
    if (mode === 'replace') {
      // 置き換えで減るものを具体的に示す（正当な空のバックアップでも判断できるように。レビュー 2026-11-07 の 02）
      const lines = pending.present.map((t) => `${TABLE_LABEL[t]}: ${counts?.[t] ?? '?'} 件 → ${pending.rows[t].length} 件`)
      if (!confirm(`次の内容をバックアップの内容に置き換えます。よろしいですか？\n\n${lines.join('\n')}`)) return
    }
    try {
      await restoreBackup(pending, mode)
      setImportMsg(mode === 'replace' ? 'バックアップの内容に置き換えました' : '今のデータにバックアップの内容を追加しました')
    } catch (e) {
      setImportMsg(`復元できませんでした: ${e instanceof Error ? e.message : String(e)}`)
    }
    setPending(null)
  }

  return (
    <Page title={t('settings.title')}>
      <Accordion persistKey="settings">
        <AccordionSection value="appearance" title={t('settings.appearance')} icon={<Palette className="size-5" />}>
          <Row label={t('settings.theme')}>
            <Segmented<ThemeMode>
              value={s.theme}
              onChange={(v) => s.set('theme', v)}
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]}
            />
          </Row>
          <Row label={t('settings.motion')}>
            <Segmented
              value={s.reduceMotion ? 'off' : 'on'}
              onChange={(v) => s.set('reduceMotion', v === 'off')}
              options={[
                { value: 'on', label: t('settings.motionOn') },
                { value: 'off', label: t('settings.motionOff') },
              ]}
            />
          </Row>
          <Row label="センシティブな単語を表示する">
            <Segmented
              value={s.showSensitive ? 'on' : 'off'}
              onChange={(v) => {
                if ((v === 'on') === s.showSensitive) return
                s.set('showSensitive', v === 'on')
                // 辞書・検索の索引を作り直すため、再読み込みする（設定は保存済み）
                setTimeout(() => location.reload(), 50)
              }}
              options={[
                { value: 'off', label: '表示しない' },
                { value: 'on', label: '表示する' },
              ]}
            />
          </Row>
          <p className="-mt-1 text-xs text-muted">
            「表示しない」（既定）では、センシティブな単語を一覧・検索・つながり・学習・分析などアプリのどこにも出しません。切り替えるとアプリを読み込み直します。
          </p>
          <Row label="アクセス数の計測に協力する">
            <Segmented
              value={s.analytics ? 'on' : 'off'}
              onChange={(v) => s.set('analytics', v === 'on')}
              options={[
                { value: 'on', label: '協力する' },
                { value: 'off', label: '協力しない' },
              ]}
            />
          </Row>
          <p className="-mt-1 text-xs text-muted">
            アプリの改善のため、開いた画面の種類（単語・学習・AI など）と AI 機能を使った回数だけを GoatCounter に送ります。単語名・学習内容・個人を特定する情報は送りません。
          </p>
        </AccordionSection>

        <AccordionSection value="speech" title={t('settings.speech')} icon={<Volume2 className="size-5" />}>
          {ttsSupported ? (
            <>
              <Row label={t('settings.ttsVoice')}>
                <select
                  className={selectClass}
                  value={s.ttsVoiceURI ?? ''}
                  onChange={(e) => s.set('ttsVoiceURI', e.target.value || null)}
                >
                  <option value="">{t('settings.ttsVoiceDefault')}</option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </Row>
              <Row label={`${t('settings.ttsRate')}: ${s.ttsRate.toFixed(2)}`}>
                <input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  value={s.ttsRate}
                  onChange={(e) => s.set('ttsRate', Number(e.target.value))}
                  className="w-48 accent-[var(--accent)]"
                />
              </Row>
              <Row label={t('settings.autoSpeak')}>
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--accent)]"
                  checked={s.autoSpeak}
                  onChange={(e) => s.set('autoSpeak', e.target.checked)}
                />
              </Row>
              <Row label="">
                <Button size="sm" onClick={() => speak('The etymology connects words like a neural network.')}>
                  {t('settings.testSpeak')}
                </Button>
              </Row>
            </>
          ) : (
            <p className="text-sm text-muted">Speech synthesis is not supported in this browser.</p>
          )}
        </AccordionSection>

        <AccordionSection value="study" title={t('settings.study')} icon={<GraduationCap className="size-5" />}>
          <Row label={t('settings.dailyNew')}>
            <input
              type="number"
              min={0}
              max={500}
              value={s.dailyNewLimit}
              onChange={(e) => s.set('dailyNewLimit', Math.max(0, Number(e.target.value)))}
              className={selectClass + ' w-24'}
            />
          </Row>
          <Row label={`${t('settings.retention')}: ${Math.round(s.desiredRetention * 100)}%`}>
            <input
              type="range"
              min={0.7}
              max={0.97}
              step={0.01}
              value={s.desiredRetention}
              onChange={(e) => s.set('desiredRetention', Number(e.target.value))}
              className="w-48 accent-[var(--accent)]"
            />
          </Row>
        </AccordionSection>

        {settingsExtensions.map((ext) => (
          <AccordionSection key={ext.id} value={ext.id} title={t(ext.titleKey)} icon={<ext.icon className="size-5" />}>
            <Suspense fallback={null}>
              <ext.Component />
            </Suspense>
          </AccordionSection>
        ))}

        <AccordionSection value="data" title={t('settings.data')} icon={<Database className="size-5" />}>
          <Row label={t('settings.storage')}>
            <StorageInfo />
          </Row>
          <Row label="辞書をオフライン用に保存">
            <OfflinePrep />
          </Row>
          <Row label={t('settings.exportData')}>
            <Button size="sm" onClick={doExport}>
              {t('settings.exportData')}
            </Button>
          </Row>
          <Row label={t('settings.importData')}>
            <Button size="sm" onClick={doImport}>
              {t('settings.importData')}
            </Button>
          </Row>
          {pending && (
            <div className="my-2 rounded-xl border border-border bg-surface-2/50 p-3 text-sm">
              <p className="font-medium">
                バックアップの内容{pending.exportedAt ? `（${new Date(pending.exportedAt).toLocaleString('ja-JP')} に作成）` : ''}
              </p>
              <table className="mt-1 w-full text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="py-0.5 text-left font-normal">内容</th>
                    <th className="py-0.5 text-right font-normal">この端末</th>
                    <th className="py-0.5 text-right font-normal">バックアップ</th>
                  </tr>
                </thead>
                <tbody>
                  {BACKUP_TABLES.map((t) => (
                    <tr key={t}>
                      <td className="py-0.5">{TABLE_LABEL[t]}</td>
                      <td className="py-0.5 text-right tabular-nums">{counts?.[t].toLocaleString('ja-JP') ?? '…'}</td>
                      <td className="py-0.5 text-right tabular-nums">
                        {pending.present.includes(t) ? `${pending.rows[t].length.toLocaleString('ja-JP')} 件` : <span className="text-muted">含まれていない</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-muted">
                <li>今のデータに追加: 今のデータは消さず、古いもので上書きしません（カードは復習が新しい方、語根レッスンは最高点と回数の大きい方）。設定は今のままです</li>
                <li>置き換えて復元: バックアップに含まれている表を、バックアップの内容に置き換えます。含まれていない表は今のままで、設定（{Object.keys(pending.settings).length} 項目）も復元します</li>
              </ul>
              {pending.skipped > 0 && <p className="mt-1 text-xs text-danger">形式が正しくない {pending.skipped} 件は取り込みません</p>}
              <p className="mt-2 text-xs text-muted">API キーと AI の接続設定はバックアップに含まれません（復元後に設定し直してください）。</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => void doRestore('merge')}>
                  今のデータに追加
                </Button>
                <Button size="sm" variant="danger" onClick={() => void doRestore('replace')}>
                  置き換えて復元
                </Button>
                <Button size="sm" onClick={() => setPending(null)}>
                  キャンセル
                </Button>
              </div>
            </div>
          )}
          {importMsg && <p className="my-1 text-xs text-muted">{importMsg}</p>}
          <Row label={t('settings.clearHistory')}>
            <DangerButton label={t('common.clear')} action={clearHistory} />
          </Row>
          <Row label={t('settings.clearStudy')}>
            <DangerButton label={t('common.clear')} action={clearStudy} />
          </Row>
          <Row label={t('settings.clearAll')}>
            <DangerButton
              label={t('common.clear')}
              action={async () => {
                await clearEverything()
                location.reload()
              }}
            />
          </Row>
        </AccordionSection>
      </Accordion>
    </Page>
  )
}
