import { Divider, Stack } from '@chakra-ui/react'
import ConversionRow from '../../shared/ui/kit/ConversionRow.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { usePlayback } from '../../shared/ui/kit/motion.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { currencyDemo } from './landingDemo.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

const FX = currencyDemo()
const revealAt = (i) => 0.3 + 0.45 * i

// Foreign-currency expenses that convert to the base currency at the rate
// captured when they were logged; conversions reveal row by row in view.
export default function CurrencyMock() {
  const t = useT('landing')
  const playback = usePlayback({ once: true })
  return (
    <Panel ref={playback.ref} title={t('demo.currency.title', { base: FX.base })}
      label={t('demo.currency.label', { base: FX.base })}>
      <Stack spacing={3}>
        {FX.rows.map((r, i) => (
          <ConversionRow key={r.id} label={t(`demo.currency.${r.id}`)} rate={r.rate}
            from={formatMoney(r.minor, r.currency)} to={formatMoney(r.baseMinor, FX.base)}
            playback={playback} delay={revealAt(i)} />
        ))}
        <Divider borderColor="border.default" />
        <Figure layout="inline" label={t('demo.total')} value={formatMoney(FX.totalBaseMinor, FX.base)}
          playback={playback} delay={revealAt(FX.rows.length)} />
      </Stack>
    </Panel>
  )
}
