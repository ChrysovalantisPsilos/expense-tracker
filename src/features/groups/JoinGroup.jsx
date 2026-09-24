import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Flex, Center, Stack, HStack, Heading, Text, Button,
  Avatar, Divider, List, ListItem, Spacer, useToast,
} from '@chakra-ui/react'
import { Check, X } from 'lucide-react'
import { previewLinkInvite, joinViaLink } from './groups.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import GroupMark from './GroupMark.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import RingLoader from '../../shared/ui/RingLoader.jsx'

const INVITE_UNAVAILABLE = 'This invite link is invalid or has expired. Ask whoever invited you for a fresh link.'

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
      .catch((e) => {
        console.error('[groups] invite preview failed:', e)
        if (active) setState({ status: 'error', message: userMessage(e, INVITE_UNAVAILABLE) })
      })
    return () => { active = false }
  }, [token, navigate])

  async function accept() {
    setBusy('accept')
    try {
      const gid = await joinViaLink(token)
      navigate(`/groups/${gid}`, { replace: true })
    } catch (e) {
      console.error('[groups] join failed:', e)
      toast({ title: 'Couldn’t join', description: userMessage(e), status: 'error' })
      setBusy(null)
    }
  }

  function decline() {
    navigate('/groups', { replace: true })
  }

  if (state.status === 'loading') {
    return <RingLoader fullScreen caption="Loading invite…" />
  }

  if (state.status === 'invalid' || state.status === 'error') {
    return (
      <Center h="100dvh" px={4}>
        <Stack spacing={4} textAlign="center" maxW="sm">
          <Heading size="md">Invite unavailable</Heading>
          <Text color="text.muted">
            {state.message || INVITE_UNAVAILABLE}
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
            <Flex justify="center" mb={3}>
              <GroupMark name={group.name} src={group.image_url} size={56} />
            </Flex>
            <Heading size="lg">{group.name || 'Group invite'}</Heading>
            <Text color="text.muted" mt={1}>You’ve been invited to join</Text>
          </Box>

          {members.length > 0 && (
            <Panel title="Members">
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
            </Panel>
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
