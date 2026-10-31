import { BookText, Database, ExternalLink, Info, Keyboard, Package, Scale, Shield, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionSection } from '@/components/ui/Accordion'
import { Card } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { appInfo, assetUrl } from '@/lib/appInfo'
import { dataSources } from './credits'

interface ThirdParty {
  name: string
  version: string
  license: string | null
  author?: string
  repository?: string
  homepage?: string
  licenseText?: string | null
}

function ThirdPartyLicenses() {
  const { t } = useTranslation()
  const [list, setList] = useState<ThirdParty[] | null | 'error'>(null)
  useEffect(() => {
    fetch(assetUrl('third-party-licenses.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setList)
      .catch(() => setList('error'))
  }, [])
  if (list === null) return <p className="text-sm text-muted">{t('help.licensesLoading')}</p>
  if (list === 'error') return <p className="text-sm text-muted">{t('help.licensesUnavailable')}</p>
  return (
    <ul className="flex flex-col divide-y divide-border">
      {list.map((d) => (
        <li key={d.name + d.version} className="py-2 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <a
              href={d.homepage || d.repository?.replace(/^git\+/, '').replace(/\.git$/, '') || `https://www.npmjs.com/package/${d.name}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent hover:underline"
            >
              {d.name}
            </a>
            <span className="text-xs text-muted">v{d.version}</span>
            <span className="rounded bg-surface-2 px-1.5 text-xs">{d.license ?? '-'}</span>
          </div>
          {d.author && <div className="text-xs text-muted">{d.author}</div>}
          {d.licenseText && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-muted">{t('help.showLicense')}</summary>
              <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-2 text-[11px] leading-snug">
                {d.licenseText}
              </pre>
            </details>
          )}
        </li>
      ))}
    </ul>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  )
}

export function HelpPage() {
  const { t } = useTranslation()
  return (
    <Page title={t('help.title')}>
      <Card className="mb-4">
        <div className="mb-2 flex items-center gap-3">
          <img src="./icon.svg" alt="" className="size-10 rounded-xl" />
          <div>
            <div className="font-semibold">{appInfo.name}</div>
            <div className="text-xs text-muted">{t('app.tagline')}</div>
          </div>
        </div>
        <InfoRow label={t('help.version')} value={`v${appInfo.version}`} />
        <InfoRow label={t('help.buildDate')} value={new Date(appInfo.buildDate).toLocaleString()} />
        <InfoRow label={t('help.commit')} value={appInfo.commit} />
      </Card>

      <Accordion>
        <AccordionSection value="about" title={t('help.about')} icon={<Info className="size-5" />}>
          <div className="space-y-2 text-sm leading-relaxed">
            <p>
              「ニューロン英単語」は、英単語を<strong>語源（語根・接頭辞・接尾辞）</strong>や<strong>意味のつながり</strong>
              で結び、脳の神経回路（ニューロン）のようなネットワークとして覚えるためのアプリです。
            </p>
            <p>1つの単語から関連する単語へ次々と辿れるので、気になった単語から自然に学びが広がります。</p>
          </div>
        </AccordionSection>
        <AccordionSection value="howto" title={t('help.howTo')} icon={<BookText className="size-5" />}>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
            <li>「単語」で英単語・熟語・語根を検索します。</li>
            <li>単語ページで意味・語の成り立ち・例文・関連語を確認します。青い単語はタップするとその単語へ移動できます。</li>
            <li>「つながり」で語源や意味のネットワークを眺め、気になるグループを辿ります。</li>
            <li>「学習」で FSRS（間隔反復アルゴリズム）による復習を行い、記憶を定着させます。</li>
            <li>「分析」で学習状況や閲覧履歴を振り返り、新しい気づきを得ます。</li>
          </ol>
        </AccordionSection>
        <AccordionSection value="features" title={t('help.features')} icon={<Sparkles className="size-5" />}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li>語源・意味のネットワーク探索（WebGL による高速描画）</li>
            <li>FSRS による記憶定着スケジューリング</li>
            <li>音声読み上げ（Web Speech API）</li>
            <li>単語ごとの表示履歴の記録</li>
            <li>学習データの分析・ドリルダウン</li>
            <li>AI（Gemini / OpenAI / Claude / OpenRouter）との連携（任意）</li>
          </ul>
        </AccordionSection>
        <AccordionSection value="shortcuts" title={t('help.shortcuts')} icon={<Keyboard className="size-5" />}>
          <ul className="space-y-1.5 text-sm">
            <li>
              <kbd className="rounded bg-surface-2 px-1.5 font-mono">/</kbd> 検索へ移動
            </li>
            <li>
              <kbd className="rounded bg-surface-2 px-1.5 font-mono">Space</kbd> 学習中：答えを表示
            </li>
            <li>
              <kbd className="rounded bg-surface-2 px-1.5 font-mono">1</kbd>〜
              <kbd className="rounded bg-surface-2 px-1.5 font-mono">4</kbd> 学習中：評価（もう一度／難しい／正解／簡単）
            </li>
          </ul>
        </AccordionSection>
        <AccordionSection value="privacy" title={t('help.privacy')} icon={<Shield className="size-5" />}>
          <div className="space-y-2 text-sm leading-relaxed">
            <p>学習履歴・設定などのデータは全てお使いのブラウザ内（IndexedDB / localStorage）にのみ保存され、外部サーバーへ送信されません。</p>
            <p>AI 機能を使う場合のみ、入力内容が選択した AI サービスへ直接送信されます。API キーはパスフレーズで暗号化して保存されます。</p>
          </div>
        </AccordionSection>
        <AccordionSection value="data-sources" title={t('help.dataSources')} icon={<Database className="size-5" />}>
          <ul className="flex flex-col gap-3 text-sm">
            {dataSources.map((d) => (
              <li key={d.name}>
                <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                  {d.name}
                </a>
                <div className="text-xs text-muted">{d.usage}</div>
                <a href={d.licenseUrl} target="_blank" rel="noreferrer" className="text-xs underline">
                  {d.license}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            単語データ（public/data）は上記出典を加工した二次著作物であり、CC BY-SA 4.0 で提供されます。
          </p>
        </AccordionSection>
        <AccordionSection value="credits" title={t('help.credits')} icon={<Package className="size-5" />}>
          <ThirdPartyLicenses />
        </AccordionSection>
        <AccordionSection value="license" title={t('help.licenseOfApp')} icon={<Scale className="size-5" />}>
          <p className="text-sm">
            ソースコードは <strong>MIT License</strong> で公開されています。単語データは CC BY-SA 4.0 です。
          </p>
          <a
            href={appInfo.repository}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            {t('help.repository')} <ExternalLink className="size-3.5" />
          </a>
        </AccordionSection>
      </Accordion>
    </Page>
  )
}
