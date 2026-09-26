import { Box, Stack } from '@chakra-ui/react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import TrendBars from '../../shared/ui/kit/TrendBars.jsx'
import { ShareLegend, StackedBar } from '../../shared/ui/kit/ShareBar.jsx'
import { usePlayback } from '../../shared/ui/kit/motion.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortMonth } from '../../shared/lib/dates.js'
import { DEMO_CURRENCY, insightsDemo } from './landingDemo.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

const { byCategory, trend } = insightsDemo()
const LATEST = trend[trend.length - 1]

// Spending by category (one stacked bar + legend) and a 6-month trend whose
// columns grow in when scrolled into view.
export default function InsightsMock() {
  const t = useT('landing')
  const playback = usePlayback({ once: true })
  const shares = byCategory.map((c) => ({ name: c.category, label: t(`demo.categories.${c.id}`), share: c.share }))
  const bars = trend.map((m) => ({ label: shortMonth(m.monthIndex), value: m.minor }))
  return (
    <Panel ref={playback.ref} title={t('demo.insights.title')} label={t('demo.insights.label')}>
      <Stack spacing={5}>
        <Box>
          <StackedBar items={shares} playback={playback} />
          <ShareLegend items={shares} mt={3} />
        </Box>
        <Box>
          <SectionLabel mb={3} aside={`${shortMonth(LATEST.monthIndex)}: ${formatMoney(LATEST.minor, DEMO_CURRENCY)}`}>
            {t('demo.insights.last6')}
          </SectionLabel>
          <TrendBars bars={bars} playback={playback} />
        </Box>
      </Stack>
    </Panel>
  )
}
