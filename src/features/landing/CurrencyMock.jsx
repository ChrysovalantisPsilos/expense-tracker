import { Divider, Stack } from '@chakra-ui/react'
import ConversionRow from '../../shared/ui/kit/ConversionRow.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { usePlayback } from '../../shared/ui/kit/motion.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { currencyDemo } from './landingDemo.js'

const FX = currencyDemo()
const revealAt = (i) => 0.3 + 0.45 * i

// Foreign-currency expenses that convert to the base currency at the rate
// captured when they were logged; conversions reveal row by row in view.
export default function CurrencyMock() {
  const playback = usePlayback({ once: true })
  return (
    <Panel ref={playback.ref} title={`Travel spending in ${FX.base}`}
      label={`Example: expenses in pounds, dollars and yen converted to ${FX.base} at the rate captured when each was added.`}>
      <Stack spacing={3}>
        {FX.rows.map((r, i) => (
          <ConversionRow key={r.label} label={r.label} rate={r.rate}
            from={formatMoney(r.minor, r.currency)} to={formatMoney(r.baseMinor, FX.base)}
            playback={playback} delay={revealAt(i)} />
        ))}
        <Divider borderColor="border.default" />
        <Figure layout="inline" label="Total" value={formatMoney(FX.totalBaseMinor, FX.base)}
          playback={playback} delay={revealAt(FX.rows.length)} />
      </Stack>
    </Panel>
  )
}
