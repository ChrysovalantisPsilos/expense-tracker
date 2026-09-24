import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Box, Stack, HStack, Text, Button, Icon, useToast } from '@chakra-ui/react'
import { Plus, ChevronRight, Check, X } from 'lucide-react'
import { listGroups, listGroupSummaries, listMyInvites, respondToInvite } from './groups.js'
import { myGroupBalance, pluralise } from './groupFormat.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useLiveQuery } from '../../shared/lib/db.js'
import QueryError from '../../shared/ui/QueryError.jsx'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import EmptyState from '../../shared/ui/EmptyState.jsx'
import GroupMark from './GroupMark.jsx'
import AvatarStack from './AvatarStack.jsx'
import { GroupsSkeleton } from './GroupSkeletons.jsx'
import { textColor } from '../../shared/ui/kit/kitMath.js'
import { userMessage } from '../../shared/lib/errors.js'

const NO_GROUPS = { groups: [], summaries: new Map(), invites: [] }

export default function Groups() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  // Live overview: balances, memberships, and the invite inbox update as they
  // change. No filters — RLS already scopes events to groups you belong to
  // (and invites addressed to you).
  const { data, loading, error, reload: load, mutate } = useLiveQuery(async () => {
    const [groups, invites] = await Promise.all([listGroups(), listMyInvites()])
    // Avatars + balances are extras: if they fail, the list still shows.
    const summaries = await listGroupSummaries(groups.map((g) => g.id)).catch(() => new Map())
    return { groups, summaries, invites }
  }, {
    key: 'groups-list',
    specs: [
      { table: 'groups' },
      { table: 'group_members' },
      { table: 'group_invites' },
      { table: 'group_expenses' },
      { table: 'settlements' },
    ],
    initial: NO_GROUPS,
  })
  const { groups, summaries, invites } = data // summaries: groupId → { members, balances }

  async function respond(inviteId, accept) {
    try {
      const gid = await respondToInvite(inviteId, accept)
      mutate((d) => ({ ...d, invites: d.invites.filter((i) => i.invite_id !== inviteId) }))
      if (accept && gid) navigate(`/groups/${gid}`)
      else load()
    } catch (e) {
      console.error('[groups] invite response failed:', e)
      toast({ title: userMessage(e, 'Couldn’t answer the invite. Please try again.'), status: 'error' })
    }
  }

  const openNew = () => navigate('/groups/new')

  return (
    <Stack spacing={5}>
      <PageHeader title="Groups"
        action={<PageAction icon={<Plus size={16} />} label="New group" onClick={openNew} />} />

      {invites.length > 0 && (
        <Stack spacing={2}>
          {invites.map((inv) => (
            <Panel key={inv.invite_id} elevation="soft" borderColor="brand.200" _dark={{ borderColor: 'brand.700' }}>
              {/* On phones the actions go under the name, so they never
                  squeeze it into a letter-per-line column. */}
              <Stack direction={{ base: 'column', sm: 'row' }} spacing={3} align={{ sm: 'center' }}>
                <HStack spacing={3} flex="1" minW={0}>
                  <GroupMark name={inv.group_name} size={40} />
                  <Stack spacing={0} flex="1" minW={0}>
                    <Text fontWeight="600" noOfLines={2} wordBreak="break-word">{inv.group_name}</Text>
                    <Text fontSize="xs" color="text.muted" noOfLines={2} wordBreak="break-word">{inv.invited_by} invited you</Text>
                  </Stack>
                </HStack>
                <HStack spacing={2} justify="flex-end" flexShrink={0}>
                  <Button size="sm" leftIcon={<Check size={16} />} onClick={() => respond(inv.invite_id, true)}>
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" leftIcon={<X size={16} />}
                    onClick={() => respond(inv.invite_id, false)}>
                    Decline
                  </Button>
                </HStack>
              </Stack>
            </Panel>
          ))}
        </Stack>
      )}

      {error ? (
        <QueryError error={error} onRetry={load} what="your groups" py={16} />
      ) : loading ? (
        <GroupsSkeleton />
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState variant="split" title="No groups yet"
            text="Create a group for a trip or household, add the people in it, and start splitting shared expenses."
            actions={<Button as={RouterLink} to="/groups/new" leftIcon={<Plus size={18} />}>Create your first group</Button>} />
        </Panel>
      ) : (
        <Stack spacing={3}>
          {groups.map((g) => {
            const sum = summaries.get(g.id)
            const count = sum?.members.length ?? g.group_members?.[0]?.count ?? 0
            const bal = sum && myGroupBalance(sum.balances, sum.members, user.id)
            return (
              <Panel key={g.id} as={RouterLink} to={`/groups/${g.id}`} display="block"
                _hover={{ borderColor: 'brand.200', _dark: { borderColor: 'brand.700' } }}
                _focusVisible={{ boxShadow: 'outline' }} transition="border-color 0.15s">
                <HStack spacing={3}>
                  <GroupMark name={g.name} src={g.image_url} size={44} />
                  <Box flex="1" minW={0}>
                    <Text fontFamily="heading" fontWeight="700" overflowWrap="anywhere">{g.name}</Text>
                    <HStack spacing={2} mt={1} minW={0}>
                      {sum && <AvatarStack members={sum.members} myUserId={user.id} ring="bg.surface" />}
                      <Text fontSize="xs" color="text.muted">
                        {pluralise(count, 'member')}
                        {/* the currency is desktop-only when the avatars take the room */}
                        <Box as="span" display={sum ? { base: 'none', sm: 'inline' } : 'inline'}> · {g.currency}</Box>
                      </Text>
                    </HStack>
                  </Box>
                  {bal && (
                    <Box textAlign="right" flexShrink={0} color={textColor(bal.tone)}>
                      <Text fontSize="xs" fontWeight="600" whiteSpace="nowrap">{bal.label}</Text>
                      {bal.amount != null && (
                        <Text fontSize="sm" fontWeight="800" whiteSpace="nowrap">{formatMoney(bal.amount, g.currency)}</Text>
                      )}
                    </Box>
                  )}
                  <Icon as={ChevronRight} color="text.muted" flexShrink={0} />
                </HStack>
              </Panel>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}
