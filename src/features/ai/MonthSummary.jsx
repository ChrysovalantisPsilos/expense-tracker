import { Box, Button, HStack, Link, Stack, Text } from '@chakra-ui/react'
import { Sparkle } from 'lucide-react'
import { InfoBox, InfoButton, useInfoToggle } from '../../shared/ui/InfoToggle.jsx'
import { BusyNote } from '../../shared/ui/RingLoader.jsx'
import { SkeletonBlock, SkeletonRegion } from '../../shared/ui/Skeleton.jsx'
import { summaryTitle } from './aiMath.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// "Month in plain words": the "In words" side of Home's overview (shown only
// when useMonthSummary's state isn't 'hidden', aiMath.overviewWords).

// The overview header's title on that side: "✦ September in short", in the
// small bold style, so it shares the row with the Numbers | In words switch.
// `month` is 'YYYY-MM-01'.
export function SummaryTitle({ month }) {
  return (
    <HStack as="span" spacing={2} fontFamily="body" fontSize="sm" fontWeight="700" lineHeight="1.4">
      <Box as="span" color="accent.fg" flexShrink={0} display="flex"><Sparkle size={16} aria-hidden /></Box>
      <span>{summaryTitle(month)}</span>
    </HStack>
  )
}

// The body: a few lines about this month written from the category totals
// (the skeleton while it's being written, or Try again), Update once the
// totals have changed, and who wrote it. `summary` is useMonthSummary's result.
export default function MonthSummary({ summary: { state, summary, write, writeFailed } }) {
  const t = useT('ai')
  const info = useInfoToggle()
  return (
    <Stack spacing={3}>
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
        <>
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
        </>
      )}
    </Stack>
  )
}
