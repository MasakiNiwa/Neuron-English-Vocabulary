import { useParams } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Page } from '@/components/ui/Page'
import { PageSpinner } from '@/components/ui/Spinner'
import { addManyToStudy } from '@/features/study/cards'
import { morphLabel } from './components/links'
import { EntryRow } from './components/EntryRow'
import { useDictionary } from './hooks'

const TYPE_LABEL = { root: 'words.root', prefix: 'words.prefix', suffix: 'words.suffix' } as const

function MorphemeView({ id }: { id: string }) {
  const { t } = useTranslation()
  const dict = useDictionary()
  const m = dict.morphById.get(id)
  const [limit, setLimit] = useState(60)
  const [added, setAdded] = useState<number | null>(null)
  if (!m) return <p className="text-muted">{t('common.notFound')}</p>
  const words = m.words.map((k) => dict.byKey.get(k)).filter((e) => !!e)
  return (
    <>
      <div className="mb-4">
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{t(TYPE_LABEL[m.type])}</span>
        <h1 className="vt-headword font-en mt-2 text-3xl font-semibold">{morphLabel(m)}</h1>
        <p className="mt-1 text-lg">{m.meaning.ja}</p>
        <p className="mt-1 text-sm text-muted">
          {t('words.origin')}: {m.origin}
          {m.forms.length > 1 && <span className="font-en"> ・ {m.forms.join(', ')}</span>}
        </p>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">
          {t('words.wordsWithRoot')}（{words.length}）
        </h2>
        {words.length > 0 && (
          <Button
            size="sm"
            onClick={async () => setAdded(await addManyToStudy(words.slice(0, 50).map((w) => w.key)))}
          >
            {added === null ? t('words.addToStudy') : `+${added}`}
          </Button>
        )}
      </div>
      <Card className="divide-y divide-border p-0">
        {words.slice(0, limit).map((e) => (
          <EntryRow key={e.key} e={e} />
        ))}
      </Card>
      {words.length > limit && (
        <Button className="mt-3 w-full" onClick={() => setLimit((l) => l + 100)}>
          {t('common.more')}
        </Button>
      )}
    </>
  )
}

export function MorphemePage() {
  const { id } = useParams({ from: '/m/$id' })
  return (
    <Page>
      <Suspense fallback={<PageSpinner />}>
        <MorphemeView key={id} id={id} />
      </Suspense>
    </Page>
  )
}
