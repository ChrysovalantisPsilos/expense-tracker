import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Flex, Center, Stack, HStack, Heading, Text, Button, Spinner, Card,
  CardBody, Avatar, Divider, List, ListItem, Spacer, Image, useColorMode, IconButton,
} from '@chakra-ui/react'
import { Users, Sun, Moon, Lock } from 'lucide-react'
import { previewGroup } from './groups.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'

const PENDING_INVITE = STORAGE_KEYS.pendingInvite

export default function GroupPreview() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { colorMode, toggleColorMode } = useColorMode()
  const ThemeIcon = colorMode === 'dark' ? Sun : Moon
  const [data, setData] = useState(undefined) // undefined=loading, null=invalid

  useEffect(() => {
    previewGroup(token).then(setData).catch(() => setData(null))
  }, [token])

  // Net per member is computed server-side and embedded in the preview.
  const balances = useMemo(
    () => new Map((data?.members ?? []).map((m) => [m.id, Number(m.net_minor ?? 0)])),
    [data],
  )

  function goSignup() {
    localStorage.setItem(PENDING_INVITE, token)
    navigate('/login?signup=1')
  }
  function goLogin() {
    localStorage.setItem(PENDING_INVITE, token)
    navigate('/login')
  }

  if (data === undefined) return <Center h="100dvh"><Spinner size="lg" color="brand.500" /></Center>
  if (data === null) {
    return (
      <Center h="100dvh" px={4}>
        <Stack spacing={4} textAlign="center" maxW="sm">
          <Heading size="md">Invite not found</Heading>
          <Text color="text.muted">This invite link is invalid or has expired.</Text>
          <Button onClick={goLogin}>Go to Budgeer</Button>
        </Stack>
      </Center>
    )
  }

  const cur = data.group?.currency ?? 'EUR'
  const nameOf = (mid) => data.members.find((m) => m.id === mid)?.display_name ?? '—'

  return (
    <Flex direction="column" minH="100dvh" bg="bg.canvas">
      <Flex px={5} py={4} align="center">
        <HStack spacing={2.5}>
          <Image src="/budge-mark.svg" alt="Budgeer" boxSize="28px" />
          <Text fontFamily="heading" fontWeight="700" fontSize="lg">budgeer</Text>
        </HStack>
        <Spacer />
        <IconButton aria-label="Toggle theme" variant="ghost" size="sm"
          icon={<ThemeIcon size={18} />} onClick={toggleColorMode} />
      </Flex>

      <Box flex="1" px={4} pb="120px" maxW="600px" w="full" mx="auto">
        <Stack spacing={5}>
          <Box textAlign="center" pt={2}>
            <Flex boxSize="56px" mx="auto" mb={3} align="center" justify="center"
              borderRadius="2xl" bg="bg.subtle" color="accent.fg"><Users size={28} /></Flex>
            <Heading size="lg">{data.group?.name}</Heading>
            <Text color="text.muted">You’ve been invited to this group</Text>
          </Box>

          <Card><CardBody>
            <Heading size="sm" mb={3}>Members</Heading>
            <List spacing={0}>
              {data.members.map((m, i) => {
                const net = balances.get(m.id) ?? 0
                return (
                  <ListItem key={m.id}>
                    {i > 0 && <Divider />}
                    <HStack py={2.5}>
                      <Avatar size="sm" name={m.display_name} src={m.avatar_url} />
                      <Text fontWeight="500">{m.display_name}</Text>
                      <Spacer />
                      {net !== 0 && (
                        <Text fontSize="sm" color={net > 0 ? 'green.500' : 'red.500'}>
                          {net > 0 ? `owed ${formatMoney(net, cur)}` : `owes ${formatMoney(-net, cur)}`}
                        </Text>
                      )}
                    </HStack>
                  </ListItem>
                )
              })}
            </List>
          </CardBody></Card>

          <Card><CardBody>
            <Heading size="sm" mb={3}>Expenses</Heading>
            {data.expenses.length === 0 ? (
              <Text fontSize="sm" color="text.muted">No expenses yet.</Text>
            ) : (
              <List spacing={0}>
                {data.expenses.map((e, i) => (
                  <ListItem key={e.id}>
                    {i > 0 && <Divider />}
                    <HStack py={3}>
                      <Stack spacing={0}>
                        <Text fontWeight="600">{e.description || 'Expense'}</Text>
                        <Text fontSize="xs" color="text.muted">
                          {nameOf(e.paid_by)} paid · {e.spent_at}
                        </Text>
                      </Stack>
                      <Spacer />
                      <Text fontWeight="600">{formatMoney(e.amount_minor, e.currency)}</Text>
                    </HStack>
                  </ListItem>
                ))}
              </List>
            )}
          </CardBody></Card>
        </Stack>
      </Box>

      {/* Sticky signup gate */}
      <Box position="fixed" bottom={0} left={0} right={0} bg="bg.surface"
        borderTopWidth="1px" borderColor="border.default" px={4} py={3}>
        <Stack maxW="600px" mx="auto" spacing={2}>
          <HStack justify="center" color="text.muted" fontSize="xs">
            <Lock size={12} /><Text>Create a free account to join and add expenses</Text>
          </HStack>
          <HStack>
            <Button flex="1" onClick={goSignup}>Create account &amp; join</Button>
            <Button flex="1" variant="ghost" onClick={goLogin}>Log in</Button>
          </HStack>
        </Stack>
      </Box>
    </Flex>
  )
}
