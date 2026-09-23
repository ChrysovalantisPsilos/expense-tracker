import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Flex, Center, Stack, HStack, Heading, Text, Button, Image,
} from '@chakra-ui/react'
import { Users, Lock } from 'lucide-react'
import { previewGroup } from './groups.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { shortDateTime } from '../../shared/lib/dates.js'
import PublicHeader from '../../shared/ui/PublicHeader.jsx'
import BrandGlow from '../../shared/ui/BrandGlow.jsx'
import PageSpinner from '../../shared/ui/PageSpinner.jsx'

const PENDING_INVITE = STORAGE_KEYS.pendingInvite

export default function GroupPreview() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(undefined) // undefined=loading, null=invalid

  useEffect(() => {
    previewGroup(token).then(setData).catch(() => setData(null))
  }, [token])

  function goSignup() {
    localStorage.setItem(PENDING_INVITE, token)
    navigate('/login?signup=1')
  }
  function goLogin() {
    localStorage.setItem(PENDING_INVITE, token)
    navigate('/login')
  }

  if (data === undefined) return <PageSpinner fullScreen />
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

  const count = Number(data.member_count ?? 0)

  return (
    <Flex direction="column" minH="100dvh" bg="bg.canvas" overflowX="clip">
      <PublicHeader />

      <Box as="main" flex="1" position="relative" px={4} pb="120px" maxW="600px" w="full" mx="auto">
        <BrandGlow top={0} left="50%" transform="translateX(-50%)"
          w={{ base: '160%', md: '900px' }} h="480px" />
        <Stack spacing={5} position="relative">
          <Box textAlign="center" pt={2}>
            {data.group?.image_url ? (
              <Image src={data.group.image_url} alt="" boxSize="56px" mx="auto" mb={3}
                borderRadius="2xl" objectFit="cover" />
            ) : (
              <Flex boxSize="56px" mx="auto" mb={3} align="center" justify="center"
                borderRadius="2xl" bg="bg.subtle" color="accent.fg"><Users size={28} /></Flex>
            )}
            <Heading size="lg">{data.group?.name}</Heading>
            <Text color="text.muted">{data.invited_by} invited you to this group</Text>
            <HStack justify="center" spacing={1} mt={2} color="text.muted" fontSize="sm">
              <Users size={14} />
              <Text>{count} {count === 1 ? 'member' : 'members'}</Text>
            </HStack>
            {data.expires_at && (
              <Text fontSize="xs" color="text.muted" mt={1}>
                Invite expires {shortDateTime(data.expires_at)}
              </Text>
            )}
          </Box>
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
