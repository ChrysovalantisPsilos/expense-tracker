import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box, Stack, HStack, Text, Button, Center, Spinner,
  Icon, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, FormControl, FormLabel, Input, Select, useToast,
} from '@chakra-ui/react'
import { Plus, ChevronRight, Check, X } from 'lucide-react'
import {
  listGroups, listGroupSummaries, createGroup, listMyInvites, respondToInvite,
} from './groups.js'
import { myGroupBalance, pluralise } from './groupFormat.js'
import { CURRENCIES, formatMoney } from '../../shared/lib/currency.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/useProfile.js'
import { useLiveRefetch } from '../../shared/lib/realtime.js'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import GroupMark from './GroupMark.jsx'
import AvatarStack from './AvatarStack.jsx'
import { textColor } from '../../shared/ui/kit/kitMath.js'

export default function Groups() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { baseCurrency } = useProfile()
  const [groups, setGroups] = useState([])
  const [summaries, setSummaries] = useState(new Map()) // groupId → { members, balances }
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(baseCurrency)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function load() {
    // Quiet reloads: live updates swap data in place; the initial `loading`
    // state covers first paint.
    try {
      const [gs, inv] = await Promise.all([listGroups(), listMyInvites()])
      // Avatars + balances are extras: if they fail, the list still shows.
      const sums = await listGroupSummaries(gs.map((g) => g.id)).catch(() => new Map())
      setGroups(gs)
      setSummaries(sums)
      setInvites(inv)
    }
    catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  // Live overview: balances, memberships, and the invite inbox update as they
  // change. No filters — RLS already scopes events to groups you belong to
  // (and invites addressed to you).
  useLiveRefetch('groups-list', [
    { table: 'groups' },
    { table: 'group_members' },
    { table: 'group_invites' },
    { table: 'group_expenses' },
    { table: 'settlements' },
  ], load)

  async function respond(inviteId, accept) {
    try {
      const gid = await respondToInvite(inviteId, accept)
      setInvites((prev) => prev.filter((i) => i.invite_id !== inviteId))
      if (accept && gid) navigate(`/groups/${gid}`)
      else load()
    } catch (e) { toast({ title: e.message, status: 'error' }) }
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const id = await createGroup(name.trim(), currency || 'EUR')
      onClose(); setName('')
      navigate(`/groups/${id}`)
    } catch (e) {
      toast({ title: e.message, status: 'error' })
    } finally { setBusy(false) }
  }

  return (
    <Stack spacing={5}>
      <PageHeader title="Groups"
        action={<PageAction icon={<Plus size={16} />} label="New group" onClick={onOpen} />} />

      {invites.length > 0 && (
        <Stack spacing={2}>
          {invites.map((inv) => (
            <Panel key={inv.invite_id} elevation="soft" borderColor="brand.200" _dark={{ borderColor: 'brand.700' }}>
              <HStack spacing={3} flexWrap="wrap">
                <GroupMark name={inv.group_name} size={40} />
                <Stack spacing={0} flex="1" minW={0}>
                  <Text fontWeight="600" noOfLines={1}>{inv.group_name}</Text>
                  <Text fontSize="xs" color="text.muted" noOfLines={1}>{inv.invited_by} invited you</Text>
                </Stack>
                <HStack spacing={2} ml="auto">
                  <Button size="sm" leftIcon={<Check size={16} />} onClick={() => respond(inv.invite_id, true)}>
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" leftIcon={<X size={16} />}
                    onClick={() => respond(inv.invite_id, false)}>
                    Decline
                  </Button>
                </HStack>
              </HStack>
            </Panel>
          ))}
        </Stack>
      )}

      {loading ? (
        <Center py={16}><Spinner color="brand.500" /></Center>
      ) : groups.length === 0 ? (
        <Panel>
          <Center flexDir="column" py={10} gap={3} textAlign="center">
            <GroupMark size={56} />
            <Text fontWeight="600">No groups yet</Text>
            <Text color="text.muted" fontSize="sm" maxW="sm">
              Create a group for a trip or household, add the people in it, and
              start splitting shared expenses.
            </Text>
            <Button leftIcon={<Plus size={18} />} onClick={onOpen} mt={2}>Create your first group</Button>
          </Center>
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
                    <Text fontFamily="heading" fontWeight="700" noOfLines={1}>{g.name}</Text>
                    <HStack spacing={2} mt={1} minW={0}>
                      {sum && <AvatarStack members={sum.members} myUserId={user.id} ring="bg.surface" />}
                      <Text fontSize="xs" color="text.muted" noOfLines={1}>
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

      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent as="form" onSubmit={submit} mx={4}>
          <ModalHeader>New group</ModalHeader>
          <ModalBody>
            <Stack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Italy 2026, Flat 3B…" />
              </FormControl>
              <FormControl>
                <FormLabel>Currency</FormLabel>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={busy}>Create</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Stack>
  )
}
