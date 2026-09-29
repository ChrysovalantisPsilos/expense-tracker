// Your salary (/insights/salary): the regular pay over time with its raises
// and the extras under it, the raises, the extras (correctable in place),
// where the pay goes if things go on, the pay against prices, and the totals
// year by year. Two stacks side by side from lg up and on a phone held
// sideways, one column on phones.
import { Link as RouterLink } from 'react-router-dom'
import { Button, Flex, Stack, useToast } from '@chakra-ui/react'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import BackButton from '../../shared/ui/BackButton.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import EmptyState from '../../shared/ui/EmptyState.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { useShortLandscape } from '../../shared/ui/useShortLandscape.js'
import { NARROW_STACKS } from '../../shared/ui/narrowStacks.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { useSalary } from './salary.js'
import { PayCard, RaisesCard, YearsCard } from './SalaryParts.jsx'
import ExtrasCard from './SalaryExtras.jsx'
import { InflationCard, ProjectionCard } from './SalaryOutlook.jsx'

export default function SalaryPage() {
  const t = useT('salary')
  const d = useSalary()
  const sideways = useShortLandscape()
  const header = (
    <PageHeader leading={<BackButton fallback="/insights" />} eyebrow={t('eyebrow')} title={t('title')}
      description={d.report ? t('lead') : undefined} />
  )
  let body
  if (d.error) body = <Panel><QueryError error={d.error} onRetry={d.reload} what={t('what')} /></Panel>
  else if (d.loading && !d.report) body = <Panel><RingLoader compact /></Panel>
  else if (!d.salaryId) {
    body = (
      <Panel>
        <EmptyState title={t('empty.noCategoryTitle')} text={t('empty.noCategory')}
          actions={<Button as={RouterLink} to="/settings/categories/new?kind=income">{t('empty.addCategory')}</Button>} />
      </Panel>
    )
  } else if (!d.report) {
    body = (
      <Panel>
        <EmptyState title={t('empty.noEntriesTitle')} text={t('empty.noEntries')}
          actions={<Button as={RouterLink} to={`/transactions/new?kind=income&category=${d.salaryId}`}>{t('empty.addIncome')}</Button>} />
      </Panel>
    )
  } else body = <Report d={d} sideways={sideways} />
  return <Stack spacing={sideways ? 3 : 5}>{header}{body}</Stack>
}

function Report({ d, sideways }) {
  const toast = useToast()
  const { report, currency, country, nowKey } = d
  const onCountry = (c) => d.setCountry(c).catch((e) => toast(saveErrorToast(e)))
  const left = [
    <PayCard key="pay" report={report} currency={currency} sideways={sideways} />,
    <RaisesCard key="raises" report={report} currency={currency} country={country} />,
    <ExtrasCard key="extras" report={report} currency={currency} bonusId={d.bonusId} income={d.income}
      onFix={d.setFix} onBonusCategory={d.setBonusCategory} />,
  ]
  const right = [
    <ProjectionCard key="future" report={report} currency={currency} country={country} nowKey={nowKey} sideways={sideways} />,
    <InflationCard key="prices" report={report} currency={currency} country={country} onCountry={onCountry} />,
    <YearsCard key="years" report={report} currency={currency} nowKey={nowKey} />,
  ]
  const gap = sideways ? 3 : 5
  return (
    <Flex gap={gap} align="start" direction={sideways ? 'row' : { base: 'column', lg: 'row' }}
      sx={sideways ? NARROW_STACKS : undefined}>
      {[left, right].map((cards, i) => (
        <Stack key={i} spacing={gap} flex="1" minW={0} w="full">
          {cards}
        </Stack>
      ))}
    </Flex>
  )
}
