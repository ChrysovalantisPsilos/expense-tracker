import { useNavigate } from 'react-router-dom'
import { Box, Button, Flex, HStack, Stack, Text, useToast } from '@chakra-ui/react'
import { Pencil, Plus, Target, Trash2 } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import RowActions from '../../shared/ui/RowActions.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { SkeletonBlock, SkeletonRegion } from '../../shared/ui/Skeleton.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { userMessage } from '../../shared/lib/errors.js'
import { saveGoal, deleteGoal } from './savings.js'
import { goalProgress, goalRingArcs, goalSavedAfter, goalStatus } from './savingsMath.js'

const RING = { size: 48, stroke: 6 }
// The ring's text column starts after the ring and the row's gap.
const TEXT_INSET = `${RING.size + 12}px`

// A goal's progress as a small ring in the logo's colours: amber, the gap,
// then coral (goalRingArcs), on a sand track, with the percentage inside.
function GoalRing({ pct }) {
  const { size, stroke } = RING
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const { amber, coral } = goalRingArcs(pct)
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

  async function remove(g) {
    try { await deleteGoal(g.id); reload() }
    catch (e) {
      console.error('[savings] goal delete failed:', e)
      toast({ title: userMessage(e, 'Couldn’t delete the goal. Please try again.'), status: 'error' })
    }
  }
  async function addTo(g, deltaMinor) {
    try {
      // Send the full goal — the encrypting save RPC rewrites every field.
      await saveGoal({ ...g, saved_minor: goalSavedAfter(g, deltaMinor) })
      reload()
    } catch (e) {
      console.error('[savings] goal update failed:', e)
      toast({ title: userMessage(e, 'Couldn’t update the goal. Please try again.'), status: 'error' })
    }
  }

  return (
    <Panel icon={Target} title="Goals" action={
      <Button size="xs" leftIcon={<Plus size={14} />}
        onClick={() => navigate('/savings/goals/new')}>Goal</Button>
    }>
      {error ? <QueryError error={error} onRetry={reload} what="your goals" /> : loading ? (
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
        <Text color="text.muted" fontSize="sm">No goals yet — set one to start saving toward it.</Text>
      ) : (
        <Stack spacing={4}>
          {goals.map((g) => {
            const { pct, done, step } = goalProgress(g)
            const pace = goalStatus(g)
            return (
              <Box key={g.id}>
                <HStack spacing={3} align="center">
                  <GoalRing pct={pct} />
                  <Box flex="1" minW={0}>
                    <Text fontSize="sm" fontWeight="600" noOfLines={1}>{g.name}</Text>
                    <Text fontSize="xs" color="text.muted" noOfLines={1}>
                      {formatMoney(g.saved_minor, g.currency)} of {formatMoney(g.target_minor, g.currency)}
                    </Text>
                    <Text fontSize="xs" noOfLines={2} color={pace.strong ? 'text.primary' : 'text.muted'}
                      fontWeight={pace.strong ? 600 : 400}>
                      {pace.text}
                    </Text>
                  </Box>
                  <RowActions actions={[
                    { label: 'Edit', icon: Pencil, onClick: () => navigate(`/savings/goals/${g.id}`, { state: { goal: g } }) },
                    { label: 'Delete', icon: Trash2, onClick: () => remove(g), danger: true },
                  ]} />
                </HStack>
                {!done && (
                  <HStack mt={2} spacing={2} pl={TEXT_INSET}>
                    <Button size="xs" variant="outline" onClick={() => addTo(g, step)}>
                      + {formatMoney(step, g.currency)}
                    </Button>
                    {g.saved_minor > 0 && (
                      <Button size="xs" variant="ghost" onClick={() => addTo(g, -step)}>
                        − {formatMoney(step, g.currency)}
                      </Button>
                    )}
                  </HStack>
                )}
              </Box>
            )
          })}
        </Stack>
      )}
    </Panel>
  )
}
