import { Database, GraduationCap, Palette, Volume2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionSection } from '@/components/ui/Accordion'
import { Button } from '@/components/ui/Button'
import { Page } from '@/components/ui/Page'
import { clearAll, clearHistory, clearStudy, exportAll, importAll } from '@/lib/db'
import { supportedLanguages } from '@/lib/i18n'
import { speak, ttsSupported, useEnglishVoices } from '@/lib/speech'
import { useSettings, type ThemeMode } from '@/stores/settings'
import { settingsExtensions } from './extensions'

export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-xl bg-surface-2 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            'rounded-lg px-3 py-1.5 text-sm transition-colors ' +
            (value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const selectClass =
  'h-10 max-w-64 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent'

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

  const doExport = async () => {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify({ app: 'neuron-english-vocabulary', exportedAt: Date.now(), data })], {
      type: 'application/json',
    })
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
      const json = JSON.parse(await file.text()) as { data?: Record<string, unknown[]> }
      if (json.data) await importAll(json.data)
      alert(t('common.ok'))
    }
    input.click()
  }

  return (
    <Page title={t('settings.title')}>
      <Accordion>
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
          <Row label={t('settings.language')}>
            <select className={selectClass} value={s.language} onChange={(e) => s.set('language', e.target.value as never)}>
              {supportedLanguages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
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
            <ext.Component />
          </AccordionSection>
        ))}

        <AccordionSection value="data" title={t('settings.data')} icon={<Database className="size-5" />}>
          <Row label={t('settings.storage')}>
            <StorageInfo />
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
                await clearAll()
                location.reload()
              }}
            />
          </Row>
        </AccordionSection>
      </Accordion>
    </Page>
  )
}
