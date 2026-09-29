// Salary history's outlook: "If things go on" (the pay over 1–10 years three
// ways, with what it adds up to) and "Against prices" (the pay's change next
// to inflation in Belgium or Greece).
import { useMemo, useState } from 'react'
import {
  Box, HStack, SimpleGrid, Slider, SliderFilledTrack, SliderThumb, SliderTrack, Stack, Text,
} from '@chakra-ui/react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'
import { Scale, Telescope } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import { BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import { InfoBox, InfoButton, useInfoToggle } from '../../shared/ui/InfoToggle.jsx'
import { useChartTheme } from '../../shared/ui/useChartTheme.jsx'
import { minorFactor } from '../../shared/lib/currency.js'
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { axisTick } from '../insights/insightsMath.js'
import {
  COUNTRIES, HORIZONS, WHAT_IF, INFLATION_FROM, monthNum, projections, sinceChoices, vsInflation, yearOf,
} from './salaryMath.js'
import { monthLabel, pctText, rounded } from './SalaryParts.jsx'

// ── If things go on ─────────────────────────────────────────────────────────
// Line colour and dash per way.
const LINE = { trend: { color: 0 }, index: { color: 6 }, whatIf: { color: 1, dash: '5 4' } }

function ProjectionChart({ ways, currency, h }) {
  const t = useT('salary')
  const chart = useChartTheme()
  const f = minorFactor(currency)
  const data = ways[0].series.map((p, i) => Object.fromEntries([['key', p.key], ...ways.map((w) => [w.id, w.series[i].pay / f])]))
  const januaries = data.filter((d) => monthNum(d.key) === 1).map((d) => d.key)
  const every = Math.ceil(januaries.length / 6)
  const low = Math.min(...data.map((d) => Math.min(...ways.map((w) => d[w.id]))))
  const axis = { tickLine: false, axisLine: false, fontSize: 11, tick: chart.tick }
  return (
    <Box h={`${h}px`} mx={-1} role="img" aria-label={t('projection.chart')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
          <XAxis dataKey="key" ticks={januaries.filter((_, i) => i % every === 0)} tickFormatter={(k) => String(yearOf(k))}
            interval={0} {...axis} />
          <YAxis width={44} domain={[Math.floor(low * 0.95), 'auto']} tickFormatter={axisTick} {...axis} />
          <Tooltip formatter={(v) => rounded(Math.round(v * f), currency)} labelFormatter={monthLabel} {...chart.tooltip} />
          {[...ways].reverse().map((w) => (
            <Line key={w.id} type="stepAfter" dataKey={w.id} name={t(`projection.${w.id}`)} stroke={chart.series[LINE[w.id].color]}
              strokeWidth={w.id === 'trend' ? 2.5 : 2} strokeDasharray={LINE[w.id].dash} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  )
}

function WayRow({ way, currency, children }) {
  const t = useT('salary')
  const chart = useChartTheme()
  const end = way.series[way.series.length - 1].key
  return (
    <Box>
      <ItemRow py={1.5}
        media={(
          <Box boxSize="32px" borderRadius="lg" bg="bg.subtle" display="grid" placeItems="center" flexShrink={0} aria-hidden>
            <Box w="16px" h="3px" borderRadius="full" bg={chart.series[LINE[way.id].color]} />
          </Box>
        )}
        title={t('projection.way', { way: t(`projection.${way.id}`), pct: pctText(way.rate) })}
        meta={t('projection.monthlyIn', { amount: rounded(way.monthly, currency), month: monthLabel(end) })}
        amount={rounded(way.total, currency)}
        amountMeta={<Text fontSize="xs" color="text.muted">{t('projection.earned')}</Text>} />
      {children}
    </Box>
  )
}

function WhatIfSlider({ value, onChange }) {
  const t = useT('salary')
  return (
    <HStack spacing={3} pl={{ base: 0, sm: '44px' }} pr={1} pb={1}>
      <Text fontSize="xs" color="text.muted" flexShrink={0}>{t('projection.slider')}</Text>
      <Slider aria-label={t('projection.slider')} min={WHAT_IF.min} max={WHAT_IF.max} step={WHAT_IF.step}
        value={value} onChange={onChange} colorScheme="brand" flex="1" getAriaValueText={(v) => pctText(v / 100, false)}>
        <SliderTrack><SliderFilledTrack /></SliderTrack>
        <SliderThumb boxSize={5} />
      </Slider>
      <Text fontSize="sm" fontWeight="700" w="48px" textAlign="right">{pctText(value / 100, false)}</Text>
    </HStack>
  )
}

export function ProjectionCard({ report, currency, country, nowKey, sideways }) {
  const t = useT('salary')
  const info = useInfoToggle()
  const [years, setYears] = useState(5)
  const [whatIf, setWhatIf] = useState(WHAT_IF.start)
  const ways = useMemo(() => projections(report, { country, years, whatIf, nowKey }), [report, country, years, whatIf, nowKey])
  return (
    <Panel title={t('projection.title')} icon={Telescope} action={<InfoButton info={info} label={t('common:info')} />}>
      <InfoBox info={info} mt={0} mb={3}>{t('projection.info')}</InfoBox>
      <SegmentedControl options={HORIZONS.map((n) => [n, t('projection.years', { count: n })])} value={years}
        onChange={setYears} isFitted label={t('projection.horizon')} />
      <Box mt={4}><ProjectionChart ways={ways} currency={currency} h={sideways ? 120 : 150} /></Box>
      <SectionLabel mt={4} mb={1}>{t('projection.total', { count: years })}</SectionLabel>
      <Stack spacing={0}>
        {ways.map((w) => (
          <WayRow key={w.id} way={w} currency={currency}>
            {w.id === 'whatIf' && <WhatIfSlider value={whatIf} onChange={setWhatIf} />}
          </WayRow>
        ))}
      </Stack>
      {report.average == null && <Text mt={2} fontSize="xs" color="text.muted">{t('projection.trendLater')}</Text>}
    </Panel>
  )
}

// ── Against prices ──────────────────────────────────────────────────────────
export function InflationCard({ report, currency, country, onCountry }) {
  const t = useT('salary')
  const info = useInfoToggle()
  const choices = sinceChoices(report.steps)
  const [picked, setPicked] = useState(null)
  const from = choices.includes(picked) ? picked : choices[0]
  const v = from == null ? null : vsInflation(report.steps, country, from)
  const countryName = t(`inflation.${country}`)
  return (
    <Panel title={t('inflation.title')} icon={Scale} action={
      <SegmentedControl options={COUNTRIES.map((c) => [c, t(`inflation.${c}`)])} value={country} onChange={onCountry}
        label={t('inflation.country')} />
    }>
      {!v ? (
        <Text fontSize="sm" color="text.muted">
          {from == null ? t('inflation.tooOld', { year: INFLATION_FROM }) : t('inflation.needMore')}
        </Text>
      ) : (
        <Stack spacing={4}>
          {choices.length > 1 && (
            <HStack spacing={2} justify="space-between">
              <Text fontSize="sm" color="text.muted" flexShrink={0}>{t('inflation.since')}</Text>
              <SegmentedControl options={choices.map((y) => [y, String(y)])} value={from} onChange={setPicked}
                label={t('inflation.since')} flex="1" isFitted />
            </HStack>
          )}
          <Text fontSize="md" fontWeight="600">
            {t('inflation.headline', { month: monthLabel(v.fromKey), pay: pctText(v.pay), prices: pctText(v.prices) })}
          </Text>
          <SimpleGrid columns={3} spacing={2}>
            <BalanceTile label={t('inflation.pay')} value={pctText(v.pay)} />
            <BalanceTile label={t('inflation.prices')} value={pctText(v.prices)} />
            <BalanceTile label={t('inflation.real')} value={pctText(v.real)} tone={v.real >= 0 ? 'positive' : 'negative'} />
          </SimpleGrid>
          <HStack justify="space-between" align="start" spacing={2}>
            <Text fontSize="sm" color="text.muted">
              <Trans t={t} k={v.gap >= 0 ? 'inflation.ahead' : 'inflation.behind'}
                values={{ amount: rounded(Math.abs(v.gap), currency) }}
                components={{ b: <Text as="b" color="text.primary" /> }} />
            </Text>
            <InfoButton info={info} label={t('common:info')} />
          </HStack>
        </Stack>
      )}
      <InfoBox info={info}>{t('inflation.info', { month: v ? monthLabel(v.fromKey) : '', country: countryName })}</InfoBox>
    </Panel>
  )
}
