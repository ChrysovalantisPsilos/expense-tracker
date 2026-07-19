import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Flex, Center, Stack, HStack, Heading, Text, Button, Spinner, Card,
  CardBody, Avatar, Divider, List, ListItem, Spacer, useToast,
} from '@chakra-ui/react'
import { Users, Check, X } from 'lucide-react'
import { claimLinkInvite, respondToInvite } from '../lib/groups.js'

export default function JoinGroup() {
  const { token } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [state, setState] = useState({ status: 'loading' })
  const [busy, setBusy] = useState(null) // 'accept' | 'decline'

  useEffect(() => {
    let active = true
    claimLinkInvite(token)
      .then((res) => {
        if (!active) return
        // Already in the group — nothing to decide, go straight there.
        if (res.status === 'already_member') {
          navigate(`/groups/${res.group_id}`, { replace: true })
          return
        }
        setState(res)
      })
      .catch((e) => { if (active) setState({ status: 'error', message: e.message }) })
    return () => { active = false }
  }, [token, navigate])

  async function respond(accept) {
    setBusy(accept ? 'accept' : 'decline')
    try {
      const gid = await respondToInvite(state.invite_id, accept)
      if (accept) {
        navigate(`/groups/${gid}`, { replace: true })
      } else {
        toast({ title: 'Invite declined', status: 'info', duration: 2500 })
        navigate('/groups', { replace: true })
      }
    } catch (e) {
      toast({ title: 'Something went wrong', description: e.message, status: 'error' })
      setBusy(null)
    }
  }

  if (state.status === 'loading') {
    return (
      <Center h="100dvh">
        <Stack align="center" spacing={3}>
          <Spinner color="brand.500" size="lg" />
          <Text color="text.muted">Loading invite…</Text>
        </Stack>
      </Center>
    )
  }

  if (state.status === 'invalid' || state.status === 'error') {
    return (
      <Center h="100dvh" px={4}>
        <Stack spacing={4} textAlign="center" maxW="sm">
          <Heading size="md">Invite unavailable</Heading>
          <Text color="text.muted">
            {state.message || 'This invite link is invalid or has expired. Ask whoever invited you for a fresh link.'}
          </Text>
          <Button onClick={() => navigate('/groups')}>Go to groups</Button>
        </Stack>
      </Center>
    )
  }

  if (state.status === 'claimed_by_other') {
    return (
      <Center h="100dvh" px={4}>
        <Stack spacing={4} textAlign="center" maxW="sm">
          <Heading size="md">Invite already used</Heading>
          <Text color="text.muted">
            This invite link has already been claimed by another account. Ask for a new link if you still need to join.
          </Text>
          <Button onClick={() => navigate('/groups')}>Go to groups</Button>
        </Stack>
      </Center>
    )
  }

  // status === 'pending'
  const preview = state.preview ?? {}
  const group = preview.group ?? {}
  const members = preview.members ?? []
  const slot = state.preview?.member_id
    ? members.find((m) => m.id === state.preview.member_id)
    : null

  return (
    <Center minH="100dvh" px={4} py={8} bg="bg.canvas">
      <Box maxW="440px" w="full">
        <Stack spacing={5}>
          <Box textAlign="center">
            <Flex boxSize="56px" mx="auto" mb={3} align="center" justify="center"
              borderRadius="2xl" bg="bg.subtle" color="accent.fg"><Users size={28} /></Flex>
            <Heading size="lg">{group.name || 'Group invite'}</Heading>
            <Text color="text.muted" mt={1}>
              You’ve been invited to join
              {slot ? <> as <Text as="span" fontWeight="600" color="text.primary">{slot.display_name}</Text></> : null}
            </Text>
          </Box>

          {members.length > 0 && (
            <Card><CardBody>
              <Heading size="sm" mb={3}>Members</Heading>
              <List spacing={0}>
                {members.map((m, i) => (
                  <ListItem key={m.id}>
                    {i > 0 && <Divider />}
                    <HStack py={2.5}>
                      <Avatar size="sm" name={m.display_name} src={m.avatar_url} />
                      <Text fontWeight="500">{m.display_name}</Text>
                      <Spacer />
                      {slot && m.id === slot.id && (
                        <Text fontSize="xs" color="accent.fg" fontWeight="600">that’s you</Text>
                      )}
                    </HStack>
                  </ListItem>
                ))}
              </List>
            </CardBody></Card>
          )}

          <Stack spacing={2}>
            <Button leftIcon={<Check size={18} />} onClick={() => respond(true)}
              isLoading={busy === 'accept'} isDisabled={busy != null}>
              Accept &amp; join
            </Button>
            <Button variant="ghost" leftIcon={<X size={18} />} onClick={() => respond(false)}
              isLoading={busy === 'decline'} isDisabled={busy != null}>
              Decline
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Center>
  )
}
