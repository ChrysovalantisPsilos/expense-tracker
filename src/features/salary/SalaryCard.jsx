// "Your salary" on Insights: the regular pay a month, the last raise, a small
// step line of the pay, and the way into /insights/salary. Before there's
// any salary entry it says what it will show and still links to the page
// (which explains how to start).
import { Link as RouterLink } from 'react-router-dom'
import { Box, HStack, IconButton, Text } from '@chakra-ui/react'
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts'
import { ChevronRight, Wallet } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { SkeletonBlock, SkeletonRegion } from '../../shared/ui/Skeleton.jsx'
import { useChartTheme } from '../../shared/ui/useChartTheme.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { useSalary } from './salary.js'
import { PayHeadline } from './SalaryParts.jsx'

const PAGE = '/insights/salary'

export default function SalaryCard() {
  const t = useT('salary')
  const chart = useChartTheme()
  const { report, currency, loading, error } = useSalary()
  // A failed read shows on the page itself; the card just stays out of the way.
  if (error) return null
  const data = report?.steps.map((s) => ({ v: s.level })) ?? []
  return (
    <Panel title={t('title')} icon={Wallet} action={
      <IconButton as={RouterLink} to={PAGE} size="sm" variant="ghost" aria-label={t('open')} icon={<ChevronRight size={18} />} />
    }>
      {loading && !report ? (
        <SkeletonRegion><SkeletonBlock h="64px" radius="lg" /></SkeletonRegion>
      ) : !report ? (
        <Text fontSize="sm" color="text.muted">{t('card.empty')}</Text>
      ) : (
        <HStack align="end" spacing={4}>
          <Box flex="1" minW={0}><PayHeadline report={report} currency={currency} size="card" /></Box>
          {data.length > 1 && (
            <Box w="40%" h="64px" flexShrink={0} aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
                  <YAxis hide domain={[(min) => min * 0.92, 'auto']} />
                  <Area type="stepAfter" dataKey="v" stroke={chart.series[0]} strokeWidth={2} fill={chart.series[0]}
                    fillOpacity={0.12} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          )}
        </HStack>
      )}
      <Text as={RouterLink} to={PAGE} display="inline-block" mt={3} fontSize="sm" color="accent.fg" fontWeight="600">
        {report ? t('card.open') : t('card.start')}
      </Text>
    </Panel>
  )
}
