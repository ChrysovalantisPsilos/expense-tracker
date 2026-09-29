// Salary history's pieces: the formatting, the headline with the last raise,
// the pay chart (regular pay as steps, extras as bars under it), the raises
// and the year-by-year totals. The extras (with their corrections) are in
// SalaryExtras.jsx, the future and the prices in SalaryOutlook.jsx.
import { useMemo, useState } from 'react'
import { Box, Button, HStack, Stack, Text, Wrap, WrapItem } from '@chakra-ui/react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'
import { ArrowUpRight, CalendarDays, TrendingDown, TrendingUp } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { useChartTheme } from '../../shared/ui/useChartTheme.jsx'
import { formatMoney, formatRoundedMoney, minorFactor } from '../../shared/lib/currency.js'
import { shortMonth } from '../../shared/lib/dates.js'
import { intlLocale } from '../../shared/lib/i18n/i18n.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { axisTick } from '../../shared/ui/chartAxis.js'
import { EXTRA_KINDS, monthNum, raiseKind, yearOf } from './salaryMath.js'

// ── Formatting ──────────────────────────────────────────────────────────────
// A rate as "+3.2%" (signed: a true minus for a fall) or "3.2%".
export function pctText(x, signed = true) {
  const s = new Intl.NumberFormat(intlLocale('en-GB'), {
    style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(Math.abs(x))
  if (!signed) return s
  return `${x < 0 ? '−' : '+'}${s}`
}
export const monthLabel = (key) => `${shortMonth(monthNum(key) - 1)} ${yearOf(key)}`
export const money = (minor, currency) => formatMoney(minor, currency)
export const rounded = (minor, currency) => formatRoundedMoney(minor, currency)

// The chip under the pay: "+3.2% in Jan 2026", or "No raise yet".
export function RaiseChip({ raise, small }) {
  const t = useT('salary')
  if (!raise) return <Text fontSize={small ? 'xs' : 'sm'} color="text.muted">{t('noRaise')}</Text>
  return (
    <HStack spacing={1} px={2} py={0.5} borderRadius="full" bg="status.positiveSubtle" color="status.positive"
      fontSize={small ? 'xs' : 'sm'} fontWeight="700" w="fit-content">
      <ArrowUpRight size={15} aria-hidden />
      <Text>{t('lastRaise', { pct: pctText(raise.pct), month: monthLabel(raise.key) })}</Text>
    </HStack>
  )
}

// The regular pay a month, big, with the last raise under it.
export function PayHeadline({ report, currency, size = 'hero' }) {
  const t = useT('salary')
  return (
    <Box minW={0}>
      <Text fontSize="xs" color="text.muted">{t('regular')}</Text>
      <HStack align="baseline" spacing={1.5} flexWrap="wrap">
        <Text fontFamily="heading" fontWeight="700" lineHeight="1.15" whiteSpace="nowrap"
          fontSize={size === 'hero' ? { base: '3xl', lg: '4xl' } : '2xl'}>{money(report.level, currency)}</Text>
        <Text fontSize="sm" color="text.muted">{t('perMonth')}</Text>
      </HStack>
      <Box mt={2}><RaiseChip raise={report.lastRaise} small={size !== 'hero'} /></Box>
    </Box>
  )
}

// ── The pay chart ───────────────────────────────────────────────────────────
// Series colour per extra kind (useChartTheme's series).
const EXTRA_COLOR = { holiday: 1, thirteenth: 5, bonus: 6 }
const MARGIN = { top: 6, right: 6, bottom: 0, left: 0 }
const AXIS_W = 44

export function PayChart({ report, currency, h = 170, extrasH = 64 }) {
  const t = useT('salary')
  const chart = useChartTheme()
  const f = minorFactor(currency)
  const data = useMemo(() => {
    const byKey = new Map(report.steps.map((s) => [s.key, { key: s.key, level: s.level / f, holiday: 0, thirteenth: 0, bonus: 0 }]))
    for (const e of report.extras) { const d = byKey.get(e.key); if (d) d[e.kind] += e.minor / f }
    return [...byKey.values()]
  }, [report, f])
  const hasExtras = data.some((d) => d.holiday || d.thirteenth || d.bonus)
  // One tick a year (January, or the first month); every other year past eight.
  const januaries = data.filter((d, i) => i === 0 || monthNum(d.key) === 1).map((d) => d.key)
  const every = Math.ceil(januaries.length / 8)
  const ticks = januaries.filter((_, i) => i % every === 0)
  const fmt = (v) => money(Math.round(v * f), currency)
  const low = Math.min(...data.map((d) => d.level))
  const axis = { tickLine: false, axisLine: false, fontSize: 11, tick: chart.tick }
  return (
    <Box role="img" aria-label={t('chart.aria', { from: monthLabel(data[0].key), to: monthLabel(data[data.length - 1].key) })}>
      <Box h={`${h}px`} mx={-1} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={MARGIN}>
            <defs>
              <linearGradient id="salaryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.series[0]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={chart.series[0]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
            <XAxis dataKey="key" hide={hasExtras} ticks={ticks} tickFormatter={(k) => String(yearOf(k))} interval={0} {...axis} />
            <YAxis width={AXIS_W} domain={[Math.floor(low * 0.9), 'auto']} tickFormatter={axisTick} {...axis} />
            <Tooltip formatter={fmt} labelFormatter={monthLabel} {...chart.tooltip} />
            <Area type="stepAfter" dataKey="level" name={t('chart.regular')} stroke={chart.series[0]} strokeWidth={2.5}
              fill="url(#salaryFill)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
      {hasExtras && (
        <Box h={`${extrasH}px`} mx={-1} mt={1} aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={MARGIN} barCategoryGap={0}>
              <XAxis dataKey="key" ticks={ticks} tickFormatter={(k) => String(yearOf(k))} interval={0} {...axis} />
              <YAxis width={AXIS_W} tick={false} axisLine={false} tickLine={false} />
              <Tooltip formatter={fmt} labelFormatter={monthLabel} {...chart.tooltip} />
              {EXTRA_KINDS.map((k) => (
                <Bar key={k} dataKey={k} stackId="x" name={t(`extras.${k}`)} fill={chart.series[EXTRA_COLOR[k]]}
                  radius={[2, 2, 0, 0]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}
      <ChartLegend extras={hasExtras} />
    </Box>
  )
}

function Swatch({ color, square }) {
  return <Box as="span" display="inline-block" boxSize="10px" borderRadius={square ? '2px' : 'full'} bg={color} flexShrink={0} />
}

function ChartLegend({ extras }) {
  const t = useT('salary')
  const chart = useChartTheme()
  const items = [[chart.series[0], t('chart.regular'), false],
    ...(extras ? EXTRA_KINDS.map((k) => [chart.series[EXTRA_COLOR[k]], t(`extras.${k}`), true]) : [])]
  return (
    <Wrap spacingX={3} spacingY={1} mt={2} fontSize="xs" color="text.muted" aria-hidden>
      {items.map(([c, l, sq]) => (
        <WrapItem key={l} alignItems="center" gap={1.5}><Swatch color={c} square={sq} /><Text>{l}</Text></WrapItem>
      ))}
    </Wrap>
  )
}

// ── The pay card at the top ─────────────────────────────────────────────────
export function PayCard({ report, currency, sideways }) {
  const t = useT('salary')
  return (
    <Panel>
      <PayHeadline report={report} currency={currency} />
      {report.steps.length > 1 && (
        <Box mt={4}><PayChart report={report} currency={currency} h={sideways ? 120 : 170} extrasH={sideways ? 48 : 64} /></Box>
      )}
      {report.paidMonths === 1 && <Text mt={3} fontSize="sm" color="text.muted">{t('oneMonth')}</Text>}
    </Panel>
  )
}

// ── Raises ──────────────────────────────────────────────────────────────────
const RAISE_ROWS = 5

function RaiseRow({ raise, currency, country }) {
  const t = useT('salary')
  const up = raise.pct > 0
  return (
    <ItemRow icon={up ? TrendingUp : TrendingDown} title={t(`raises.${raiseKind(raise, country)}`)} py={1.5}
      meta={t('raises.fromTo', { month: monthLabel(raise.key), from: money(raise.from, currency), to: money(raise.to, currency) })}
      amount={pctText(raise.pct)} amountTone={up ? 'positive' : 'negative'} />
  )
}

export function RaisesCard({ report, currency, country }) {
  const t = useT('salary')
  const [all, setAll] = useState(false)
  const list = [...report.raises].reverse()
  const shown = all ? list : list.slice(0, RAISE_ROWS)
  return (
    <Panel title={t('raises.title')} icon={TrendingUp}>
      <BalanceGrid>
        <BalanceTile label={t('raises.sinceLabel')}
          value={report.since == null ? '—' : t('raises.since', { count: report.since })} />
        <BalanceTile label={t('raises.average')} value={report.average == null ? '—' : pctText(report.average)}
          tone={report.average == null ? 'muted' : report.average >= 0 ? 'positive' : 'negative'}
          note={report.average == null ? t('raises.averageLater') : undefined} />
      </BalanceGrid>
      {list.length === 0 ? (
        <Text mt={3} fontSize="sm" color="text.muted">{t('raises.none')}</Text>
      ) : (
        <Stack spacing={0} mt={3}>
          {shown.map((r) => <RaiseRow key={r.key} raise={r} currency={currency} country={country} />)}
        </Stack>
      )}
      {list.length > RAISE_ROWS && (
        <Button mt={2} size="sm" variant="ghost" w="full" onClick={() => setAll((v) => !v)}>
          {all ? t('raises.fewer') : t('raises.all', { count: list.length })}
        </Button>
      )}
    </Panel>
  )
}

// ── Year by year ────────────────────────────────────────────────────────────
export function YearsCard({ report, currency, nowKey }) {
  const t = useT('salary')
  const nowYear = yearOf(nowKey)
  return (
    <Panel title={t('years.title')} icon={CalendarDays}>
      <Stack spacing={0}>
        {[...report.years].reverse().map((y) => (
          <ItemRow key={y.year} py={1.5} title={y.year === nowYear ? t('years.soFar', { year: y.year }) : String(y.year)}
            meta={t('years.split', { regular: rounded(y.regular, currency), extras: rounded(y.extras, currency) })}
            amount={rounded(y.total, currency)} />
        ))}
      </Stack>
    </Panel>
  )
}
