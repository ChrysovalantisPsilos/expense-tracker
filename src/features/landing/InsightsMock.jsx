import { Box, Stack } from '@chakra-ui/react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import TrendBars from '../../shared/ui/kit/TrendBars.jsx'
import { ShareLegend, StackedBar } from '../../shared/ui/kit/ShareBar.jsx'
import { usePlayback } from '../../shared/ui/kit/motion.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { DEMO_CURRENCY, insightsDemo } from './landingDemo.js'

const { byCategory, trend } = insightsDemo()
const SHARES = byCategory.map((c) => ({ label: c.category, share: c.share }))
const BARS = trend.map((t) => ({ label: t.month, value: t.minor }))
const LATEST = trend[trend.length - 1]

// Spending by category (one stacked bar + legend) and a 6-month trend whose
// columns grow in when scrolled into view.
export default function InsightsMock() {
  const playback = usePlayback({ once: true })
  return (
    <Panel ref={playback.ref} title="Where your money went"
      label="Example insights: spending split by category and a six-month spending trend.">
      <Stack spacing={5}>
        <Box>
          <StackedBar items={SHARES} playback={playback} />
          <ShareLegend items={SHARES} mt={3} />
        </Box>
        <Box>
          <SectionLabel mb={3} aside={`${LATEST.month}: ${formatMoney(LATEST.minor, DEMO_CURRENCY)}`}>
            Last 6 months
          </SectionLabel>
          <TrendBars bars={BARS} playback={playback} />
        </Box>
      </Stack>
    </Panel>
  )
}
