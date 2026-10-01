import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Flex, HStack, Stack, Text, useToast } from '@chakra-ui/react'
import { Pencil, Plus, Target, Trash2 } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import RowActions from '../../shared/ui/RowActions.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.jsx'
import { SkeletonBlock, SkeletonRegion } from '../../shared/ui/Skeleton.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { saveGoal, deleteGoal } from './savings.js'
import { goalParts, goalSavedAfter } from './savingsMath.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

const RING = { size: 48, stroke: 6 }
// The ring's text column starts after the ring and the row's gap.
const TEXT_INSET = `${RING.size + 12}px`

// A goal's progress as a small ring in the logo's colours: amber, the gap,
// then coral (goalParts' arcs), on a sand track, with the percentage inside.
function GoalRing({ pct, arcs }) {
  const { size, stroke } = RING
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const { amber, coral } = arcs
  const arc = ([from, len], color) => len > 0 && (
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
      transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeDasharray={`${len * c} ${c}`}
      strokeDashoffset={-from * c} style={{ stroke: color }} />
  )
  return (
    <Box position="relative" boxSize={`${size}px`} flexShrink={0}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          style={{ stroke: 'var(--chakra-colors-border-default)' }} />
        {arc(amber, 'var(--chakra-colors-amber-400)')}
        {arc(coral, 'var(--chakra-colors-brand-500)')}
      </svg>
      <Flex position="absolute" inset={0} align="center" justify="center">
        <Text fontSize="11px" fontWeight="800" lineHeight="1">{pct}%</Text>
      </Flex>
    </Box>
  )
}

// Savings goals: each a ring, its amounts and pace, Edit/Delete, and quick
// "+ a tenth" / "− a tenth" buttons (moved here from Insights).
export default function GoalsCard({ goals, loading, error, reload }) {
  const toast = useToast()
  const navigate = useNavigate()
  const t = useT('savings')
  // The goal waiting for "Delete the goal …?" (deleting asks first).
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    try { await deleteGoal(removing.id); reload() }
    catch (e) {
      console.error('[savings] goal delete failed:', e)
      toast({ title: userMessage(e, t('goals.deleteFailed')), status: 'error' })
    } finally {
      setBusy(false); setRemoving(null)
    }
  }
  async function addTo(g, deltaMinor) {
    try {
      // Send the full goal — the encrypting save RPC rewrites every field.
      await saveGoal({ ...g, saved_minor: goalSavedAfter(g, deltaMinor) })
      reload()
    } catch (e) {
      console.error('[savings] goal update failed:', e)
      toast({ title: userMessage(e, t('goals.updateFailed')), status: 'error' })
    }
  }

  return (
    <Panel icon={Target} title={t('goals.title')} action={
      <Button size="xs" leftIcon={<Plus size={14} />}
        onClick={() => navigate('/savings/goals/new')}>{t('goals.add')}</Button>
    }>
      {error ? <QueryError error={error} onRetry={reload} what={t('goals.what')} /> : loading ? (
        <SkeletonRegion>
          <Stack spacing={4}>
            {[0, 1].map((i) => (
              <HStack key={i} spacing={3}>
                <SkeletonBlock w="48px" h="48px" />
                <Stack spacing={1.5} flex="1"><SkeletonBlock w="50%" /><SkeletonBlock w="70%" h="10px" /></Stack>
              </HStack>
            ))}
          </Stack>
        </SkeletonRegion>
      ) : goals.length === 0 ? (
        <Text color="text.muted" fontSize="sm">{t('goals.empty')}</Text>
      ) : (
        <Stack spacing={4}>
          {goals.map((g) => {
            const parts = goalParts(g)
            const pace = parts.status
            return (
              <Box key={g.id}>
                <HStack spacing={3} align="center">
                  <GoalRing pct={parts.pct} arcs={parts.arcs} />
                  <Box flex="1" minW={0}>
                    <Text fontSize="sm" fontWeight="600" noOfLines={1}>{g.name}</Text>
                    <Text fontSize="xs" color="text.muted" noOfLines={1}>{parts.of}</Text>
                    <Text fontSize="xs" noOfLines={2} color={pace.strong ? 'text.primary' : 'text.muted'}
                      fontWeight={pace.strong ? 600 : 400}>
                      {pace.text}
                    </Text>
                  </Box>
                  <RowActions actions={[
                    { label: t('common:actions.edit'), icon: Pencil, onClick: () => navigate(`/savings/goals/${g.id}`, { state: { goal: g } }) },
                    { label: t('common:actions.delete'), icon: Trash2, onClick: () => setRemoving(g), danger: true },
                  ]} />
                </HStack>
                {parts.plus && (
                  <HStack mt={2} spacing={2} pl={TEXT_INSET}>
                    <Button size="xs" variant="outline" onClick={() => addTo(g, parts.step)}>{parts.plus}</Button>
                    {parts.minus && (
                      <Button size="xs" variant="ghost" onClick={() => addTo(g, -parts.step)}>{parts.minus}</Button>
                    )}
                  </HStack>
                )}
              </Box>
            )
          })}
        </Stack>
      )}
      <ConfirmDialog isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} busy={busy} danger
        title={t('goals.deleteQuestion', { name: removing?.name ?? '' })} confirmLabel={t('common:actions.delete')} />
    </Panel>
  )
}
