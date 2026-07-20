import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Flex, Center, Stack, HStack, Heading, Text, Button, Spinner, Card,
  CardBody, Avatar, Divider, List, ListItem, Spacer, useToast,
} from '@chakra-ui/react'
import { Users, Check, X } from 'lucide-react'
import { previewLinkInvite, joinViaLink } from './groups.js'

export default function JoinGroup() {
  const { token } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [state, setState] = useState({ status: 'loading' })
  const [busy, setBusy] = useState(null) // 'accept' | 'decline'

  useEffect(() => {
    let active = true
    previewLinkInvite(token)
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

  async function accept() {
    setBusy('accept')
    try {
      const gid = await joinViaLink(token)
      navigate(`/groups/${gid}`, { replace: true })
    } catch (e) {
      toast({ title: 'Couldn’t join', description: e.message, status: 'error' })
      setBusy(null)
    }
  }

  function decline() {
    navigate('/groups', { replace: true })
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

  // status === 'joinable'
  const preview = state.preview ?? {}
  const group = preview.group ?? {}
  const members = preview.members ?? []

  return (
    <Center minH="100dvh" px={4} py={8} bg="bg.canvas">
      <Box maxW="440px" w="full">
        <Stack spacing={5}>
          <Box textAlign="center">
            <Flex boxSize="56px" mx="auto" mb={3} align="center" justify="center"
              borderRadius="2xl" bg="bg.subtle" color="accent.fg"><Users size={28} /></Flex>
            <Heading size="lg">{group.name || 'Group invite'}</Heading>
            <Text color="text.muted" mt={1}>You’ve been invited to join</Text>
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
                    </HStack>
                  </ListItem>
                ))}
              </List>
            </CardBody></Card>
          )}

          <Stack spacing={2}>
            <Button leftIcon={<Check size={18} />} onClick={accept}
              isLoading={busy === 'accept'} isDisabled={busy != null}>
              Accept &amp; join
            </Button>
            <Button variant="ghost" leftIcon={<X size={18} />} onClick={decline}
              isDisabled={busy != null}>
              Decline
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Center>
  )
}
