import { useState } from 'react'
import { Box, Button, HStack, IconButton, Link, Stack, Text } from '@chakra-ui/react'
import { Sparkle, X } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { InfoBox, InfoButton, useInfoToggle } from '../../shared/ui/InfoToggle.jsx'
import { BusyNote } from '../../shared/ui/RingLoader.jsx'
import { SkeletonBlock, SkeletonRegion } from '../../shared/ui/Skeleton.jsx'
import { useCategories } from '../../shared/lib/categories.js'
import { monthName } from '../../shared/lib/dates.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { hideSummary, summaryHidden, useMonthSummary } from './ai.js'

// "Month in plain words" (Insights, and Home when `hideable`): a few lines
// about this month, written from the category totals once the helper is on,
// with Update once the totals have changed. Nothing at all while the helper
// is off or there's nothing to say yet. Home's copy can be hidden until next
// month.
export default function MonthSummary({ hideable = false }) {
  const t = useT('ai')
  const info = useInfoToggle()
  const { categories } = useCategories()
  const { state, summary, month, write, writeFailed } = useMonthSummary(categories)
  const [hidden, setHidden] = useState(() => hideable && summaryHidden(month))
  if (state === 'hidden' || hidden) return null
  const [y, m] = month.split('-').map(Number)

  return (
    <Panel icon={Sparkle} title={t('summary.title', { month: monthName(new Date(y, m - 1, 1)) })} action={hideable && (
      <IconButton size="sm" variant="ghost" color="text.muted" aria-label={t('summary.hide')} icon={<X size={16} />}
        onClick={() => { hideSummary(month); setHidden(true) }} />
    )}>
      {state === 'writing' ? (
        <Stack spacing={3}>
          <SkeletonRegion label={t('summary.working')}>
            <Stack spacing={2.5}>
              {['95%', '80%', '88%'].map((w) => <SkeletonBlock key={w} w={w} h="12px" />)}
            </Stack>
          </SkeletonRegion>
          <BusyNote>{t('summary.working')}</BusyNote>
        </Stack>
      ) : state === 'failed' ? (
        <HStack justify="space-between" spacing={3}>
          <Text fontSize="sm" color="text.muted">{t('summary.failed')}</Text>
          <Button size="sm" variant="outline" flexShrink={0} onClick={write}>{t('summary.retry')}</Button>
        </HStack>
      ) : (
        <Stack spacing={3}>
          <Stack as="ul" spacing={2} listStyleType="none" m={0}>
            {summary.lines.map((line) => (
              <HStack as="li" key={line} align="start" spacing={2.5}>
                <Box w="6px" h="6px" borderRadius="full" bg="accent.fg" mt="9px" flexShrink={0} />
                <Text>{line}</Text>
              </HStack>
            ))}
          </Stack>
          {state === 'stale' && (
            <Text fontSize="sm" color="text.muted" bg="bg.subtle" borderRadius="lg" px={3} py={2}>
              {t(writeFailed ? 'summary.updateFailed' : 'summary.stale')}{' '}
              <Link as="button" type="button" color="accent.fg" fontWeight="600" py={2} onClick={write}>
                {t(writeFailed ? 'summary.retry' : 'summary.update')}
              </Link>
            </Text>
          )}
          <Box>
            <Text color="text.muted" fontSize="xs">
              {t('summary.by')}
              <InfoButton info={info} label={t('settings.noteLabel')} ml={0.5} verticalAlign="middle" my="-4px" />
            </Text>
            <InfoBox info={info}>{t('summary.byMore')}</InfoBox>
          </Box>
        </Stack>
      )}
    </Panel>
  )
}
