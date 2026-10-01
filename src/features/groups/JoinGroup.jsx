import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Flex, Center, Stack, HStack, Heading, Text, Button,
  Avatar, Divider, List, ListItem, Spacer, useToast,
} from '@chakra-ui/react'
import { Check, X } from 'lucide-react'
import { previewLinkInvite, joinViaLink } from './groups.js'
import { joinParts } from './groupFormat.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import GroupMark from './GroupMark.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

export default function JoinGroup() {
  const { token } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const t = useT('groups')
  const [state, setState] = useState({ status: 'loading' })
  const [busy, setBusy] = useState(null) // 'accept' | 'decline'

  useEffect(() => {
    let active = true
    previewLinkInvite(token)
      .then((res) => {
        if (!active) return
        const parts = joinParts(res)
        // Already in the group — nothing to decide, go straight there.
        if (parts.status === 'open') {
          navigate(`/groups/${parts.groupId}`, { replace: true })
          return
        }
        setState(parts)
      })
      .catch((e) => {
        console.error('[groups] invite preview failed:', e)
        if (active) setState({ status: 'error', message: userMessage(e, t('join.unavailable')) })
      })
    return () => { active = false }
  }, [token, navigate, t])

  async function accept() {
    setBusy('accept')
    try {
      const gid = await joinViaLink(token)
      navigate(`/groups/${gid}`, { replace: true })
    } catch (e) {
      console.error('[groups] join failed:', e)
      toast({ title: t('join.failed'), description: userMessage(e), status: 'error' })
      setBusy(null)
    }
  }

  function decline() {
    navigate('/groups', { replace: true })
  }

  if (state.status === 'loading') {
    return <RingLoader fullScreen caption={t('join.loading')} />
  }

  if (state.status === 'invalid' || state.status === 'error') {
    return (
      <Center h="100dvh" px={4}>
        <Stack spacing={4} textAlign="center" maxW="sm">
          <Heading size="md">{t('join.unavailableTitle')}</Heading>
          <Text color="text.muted">
            {state.message || t('join.unavailable')}
          </Text>
          <Button onClick={() => navigate('/groups')}>{t('join.toGroups')}</Button>
        </Stack>
      </Center>
    )
  }

  // status === 'joinable'
  const { name, imageUrl, members } = state

  return (
    <Center minH="100dvh" px={4} py={8} bg="bg.canvas">
      <Box maxW="440px" w="full">
        <Stack spacing={5}>
          <Box textAlign="center">
            <Flex justify="center" mb={3}>
              <GroupMark name={name} src={imageUrl} size={56} />
            </Flex>
            <Heading size="lg">{name}</Heading>
            <Text color="text.muted" mt={1}>{t('join.invited')}</Text>
          </Box>

          {members.length > 0 && (
            <Panel title={t('join.members')}>
              <List spacing={0}>
                {members.map((m, i) => (
                  <ListItem key={m.id}>
                    {i > 0 && <Divider />}
                    <HStack py={2.5}>
                      <Avatar size="sm" name={m.name} src={m.src} />
                      <Text fontWeight="500">{m.name}</Text>
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
              {t('join.accept')}
            </Button>
            <Button variant="ghost" leftIcon={<X size={18} />} onClick={decline}
              isDisabled={busy != null}>
              {t('actions.decline')}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Center>
  )
}
