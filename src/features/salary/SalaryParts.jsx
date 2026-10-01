// Salary history's pieces: the formatting, the headline with the last raise,
// the pay chart (each month's pay as a dot over the regular pay's steps,
// extras as bars under it), the raises and the year-by-year totals. The
// extras (with their corrections) are in SalaryExtras.jsx, the future and the
// prices in SalaryOutlook.jsx.
import { useMemo, useState } from 'react'
import { Box, Button, HStack, Stack, Text, Wrap, WrapItem } from '@chakra-ui/react'
import { ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'
import { ArrowUpRight, CalendarDays, TrendingDown, TrendingUp } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { useChartTheme } from '../../shared/ui/useChartTheme.jsx'
import { minorFactor } from '../../shared/lib/currency.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { axisTick } from '../../shared/ui/chartAxis.js'
import { EXTRA_KINDS, yearOf } from './salaryMath.js'
import {
  RAISE_ROWS, money, monthLabel, payChartParts, payHeadline, raisesParts, yearsParts,
} from './salaryText.js'

// The chip under the pay: "+3.2% in Jan 2026" (salaryText.payHeadline's
// `raise`), or "No raise yet".
export function RaiseChip({ raise, small }) {
  const t = useT('salary')
  if (!raise) return <Text fontSize={small ? 'xs' : 'sm'} color="text.muted">{t('noRaise')}</Text>
  return (
    <HStack spacing={1} px={2} py={0.5} borderRadius="full" bg="status.positiveSubtle" color="status.positive"
      fontSize={small ? 'xs' : 'sm'} fontWeight="700" w="fit-content">
      <ArrowUpRight size={15} aria-hidden />
      <Text>{raise}</Text>
    </HStack>
  )
}

// The regular pay a month, big, with the last raise under it.
export function PayHeadline({ report, currency, size = 'hero' }) {
  const t = useT('salary')
  const head = payHeadline(report, currency)
  return (
    <Box minW={0}>
      <Text fontSize="xs" color="text.muted">{t('regular')}</Text>
      <HStack align="baseline" spacing={1.5} flexWrap="wrap">
        <Text fontFamily="heading" fontWeight="700" lineHeight="1.15" whiteSpace="nowrap"
          fontSize={size === 'hero' ? { base: '3xl', lg: '4xl' } : '2xl'}>{head.level}</Text>
        <Text fontSize="sm" color="text.muted">{t('perMonth')}</Text>
      </HStack>
      <Box mt={2}><RaiseChip raise={head.raise} small={size !== 'hero'} /></Box>
    </Box>
  )
}

// ── The pay chart ───────────────────────────────────────────────────────────
// Series colour per extra kind (useChartTheme's series).
const EXTRA_COLOR = { holiday: 1, thirteenth: 5, bonus: 6 }
const MARGIN = { top: 6, right: 6, bottom: 0, left: 0 }
// Without its year axis (the extras carry it), the pay chart keeps room for
// its lowest tick label.
const MARGIN_NO_X = { ...MARGIN, bottom: 6 }
const AXIS_W = 44
// A month's pay is a dot over the level's thin line: solid when it's the
// regular pay, hollow when it's off it (payChartRows' `off`). Smaller dots
// past three years, where the months sit close together.
const dotRadius = (months) => (months > 36 ? 2.25 : 3)
// The tooltip lists the month's pay before the level.
const payFirst = (item) => (item.dataKey === 'pay' ? 0 : 1)

function PayDot({ cx, cy, payload, r, color, surface }) {
  if (payload?.pay == null || cx == null || cy == null) return null
  return payload.off
    ? <circle cx={cx} cy={cy} r={r} fill={surface} stroke={color} strokeWidth={1.5} />
    : <circle cx={cx} cy={cy} r={r} fill={color} />
}

export function PayChart({ report, currency, h = 170, extrasH = 64 }) {
  const t = useT('salary')
  const chart = useChartTheme()
  const f = minorFactor(currency)
  const parts = useMemo(() => payChartParts(report, currency), [report, currency])
  const { rows: data, hasExtras, hasOff, axis: yAxis } = parts
  const ticks = parts.ticks.map((tick) => tick.key)
  const fmt = (v) => money(Math.round(v * f), currency)
  const axis = { tickLine: false, axisLine: false, fontSize: 11, tick: chart.tick }
  const color = chart.series[0]
  const r = dotRadius(data.length)
  return (
    <Box role="img" aria-label={parts.aria}>
      <Box h={`${h}px`} mx={-1} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={hasExtras ? MARGIN_NO_X : MARGIN}>
            <defs>
              <linearGradient id="salaryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
            <XAxis dataKey="key" hide={hasExtras} ticks={ticks} tickFormatter={(k) => String(yearOf(k))} interval={0} {...axis} />
            <YAxis width={AXIS_W} domain={yAxis.domain} ticks={yAxis.ticks} interval={0} tickFormatter={axisTick} {...axis} />
            <Tooltip formatter={fmt} labelFormatter={monthLabel} itemSorter={payFirst} {...chart.tooltip} />
            <Area type="stepAfter" dataKey="level" name={t('chart.regular')} stroke={color} strokeWidth={1.25}
              strokeOpacity={0.7} fill="url(#salaryFill)" dot={false} activeDot={false} isAnimationActive={false} />
            <Line dataKey="pay" name={t('chart.thisMonth')} stroke="none" connectNulls={false}
              dot={(p) => <PayDot key={p.key} {...p} r={r} color={color} surface={chart.surface} />}
              activeDot={{ r: r + 1.5, fill: color, stroke: chart.surface, strokeWidth: 1.5 }} isAnimationActive={false} />
          </ComposedChart>
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
      <ChartLegend extras={hasExtras} off={hasOff} />
    </Box>
  )
}

// A legend mark: 'dot' (a month's pay), 'ring' (a month off the level),
// 'line' (the level), 'square' (an extra).
function Swatch({ color, shape }) {
  const round = shape === 'dot' || shape === 'ring'
  const line = shape === 'line'
  return (
    <Box as="span" display="inline-block" flexShrink={0} w={line ? '14px' : round ? '8px' : '10px'}
      h={line ? '2px' : round ? '8px' : '10px'} borderRadius={round ? 'full' : '2px'}
      bg={shape === 'ring' ? 'transparent' : color} border={shape === 'ring' ? `1.5px solid ${color}` : undefined}
      opacity={line ? 0.7 : 1} />
  )
}

function ChartLegend({ extras, off }) {
  const t = useT('salary')
  const chart = useChartTheme()
  const coral = chart.series[0]
  const items = [
    [coral, t('chart.pay'), 'dot'],
    ...(off ? [[coral, t('chart.off'), 'ring']] : []),
    [coral, t('chart.regular'), 'line'],
    ...(extras ? EXTRA_KINDS.map((k) => [chart.series[EXTRA_COLOR[k]], t(`extras.${k}`), 'square']) : []),
  ]
  return (
    <Wrap spacingX={3} spacingY={1} mt={2} fontSize="xs" color="text.muted" aria-hidden>
      {items.map(([c, l, shape]) => (
        <WrapItem key={l} alignItems="center" gap={1.5}><Swatch color={c} shape={shape} /><Text>{l}</Text></WrapItem>
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
function RaiseRow({ row }) {
  return (
    <ItemRow icon={row.up ? TrendingUp : TrendingDown} title={row.title} py={1.5}
      meta={row.meta} amount={row.amount} amountTone={row.up ? 'positive' : 'negative'} />
  )
}

export function RaisesCard({ report, currency, country }) {
  const t = useT('salary')
  const [all, setAll] = useState(false)
  const parts = raisesParts(report, currency, country)
  const shown = all ? parts.rows : parts.rows.slice(0, RAISE_ROWS)
  return (
    <Panel title={t('raises.title')} icon={TrendingUp}>
      <BalanceGrid>
        <BalanceTile label={t('raises.sinceLabel')} value={parts.since} />
        <BalanceTile label={t('raises.average')} value={parts.average.text} tone={parts.average.tone}
          note={parts.average.note ?? undefined} />
      </BalanceGrid>
      {parts.rows.length === 0 ? (
        <Text mt={3} fontSize="sm" color="text.muted">{t('raises.none')}</Text>
      ) : (
        <Stack spacing={0} mt={3}>
          {shown.map((r) => <RaiseRow key={r.key} row={r} />)}
        </Stack>
      )}
      {parts.all && (
        <Button mt={2} size="sm" variant="ghost" w="full" onClick={() => setAll((v) => !v)}>
          {all ? t('raises.fewer') : parts.all}
        </Button>
      )}
    </Panel>
  )
}

// ── Year by year ────────────────────────────────────────────────────────────
export function YearsCard({ report, currency, nowKey }) {
  const t = useT('salary')
  return (
    <Panel title={t('years.title')} icon={CalendarDays}>
      <Stack spacing={0}>
        {yearsParts(report, currency, nowKey).map((y) => (
          <ItemRow key={y.year} py={1.5} title={y.title} meta={y.meta} amount={y.amount} />
        ))}
      </Stack>
    </Panel>
  )
}
