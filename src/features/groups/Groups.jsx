import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Heading, Stack, Card, CardBody, HStack, Text, Spacer, Button, Center, Spinner,
  Flex, Icon, Avatar, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, FormControl, FormLabel, Input, Select, useToast,
} from '@chakra-ui/react'
import { Users, Plus, ChevronRight, Check, X } from 'lucide-react'
import { listGroups, createGroup, listMyInvites, respondToInvite } from './groups.js'
import { CURRENCIES } from '../../shared/lib/currency.js'
import { useProfile } from '../../shared/lib/useProfile.js'
import { useLiveRefetch } from '../../shared/lib/realtime.js'

export default function Groups() {
  const navigate = useNavigate()
  const { baseCurrency } = useProfile()
  const [groups, setGroups] = useState([])
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
      setGroups(gs)
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
      <HStack>
        <Heading size="lg">Groups</Heading>
        <Spacer />
        <Button leftIcon={<Plus size={18} />} onClick={onOpen}>New group</Button>
      </HStack>

      {invites.length > 0 && (
        <Stack spacing={2}>
          {invites.map((inv) => (
            <Card key={inv.invite_id} borderColor="brand.200" _dark={{ borderColor: 'brand.700' }}>
              <CardBody>
                <HStack>
                  <Stack spacing={0}>
                    <Text fontWeight="600">{inv.group_name}</Text>
                    <Text fontSize="xs" color="text.muted">{inv.invited_by} invited you</Text>
                  </Stack>
                  <Spacer />
                  <Button size="sm" leftIcon={<Check size={16} />} onClick={() => respond(inv.invite_id, true)}>
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" leftIcon={<X size={16} />}
                    onClick={() => respond(inv.invite_id, false)}>
                    Decline
                  </Button>
                </HStack>
              </CardBody>
            </Card>
          ))}
        </Stack>
      )}

      {loading ? (
        <Center py={16}><Spinner color="brand.500" /></Center>
      ) : groups.length === 0 ? (
        <Card><CardBody>
          <Center flexDir="column" py={10} gap={3} textAlign="center">
            <Flex boxSize="56px" align="center" justify="center" borderRadius="2xl"
              bg="bg.subtle" color="accent.fg"><Users size={28} /></Flex>
            <Text fontWeight="600">No groups yet</Text>
            <Text color="text.muted" fontSize="sm" maxW="sm">
              Create a group for a trip or household, add the people in it, and
              start splitting shared expenses.
            </Text>
            <Button leftIcon={<Plus size={18} />} onClick={onOpen} mt={2}>Create your first group</Button>
          </Center>
        </CardBody></Card>
      ) : (
        <Stack spacing={3}>
          {groups.map((g) => (
            <Card key={g.id} cursor="pointer" _hover={{ boxShadow: 'lifted' }}
              transition="box-shadow 0.15s" onClick={() => navigate(`/groups/${g.id}`)}>
              <CardBody>
                <HStack spacing={3}>
                  <Avatar boxSize="40px" borderRadius="lg" src={g.image_url}
                    icon={<Users size={20} />} bg="bg.subtle" color="accent.fg" />
                  <Stack spacing={0}>
                    <Text fontWeight="600">{g.name}</Text>
                    <Text fontSize="xs" color="text.muted">
                      {g.group_members?.[0]?.count ?? 0} members · {g.currency}
                    </Text>
                  </Stack>
                  <Spacer />
                  <Icon as={ChevronRight} color="text.muted" />
                </HStack>
              </CardBody>
            </Card>
          ))}
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
