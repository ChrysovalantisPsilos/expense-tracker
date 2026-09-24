import { useEffect, useState } from 'react'
import { Link as RouterLink, useParams, useNavigate } from 'react-router-dom'
import {
  Box, Flex, Stack, HStack, Heading, Text, Button, Image,
} from '@chakra-ui/react'
import { Users, Lock } from 'lucide-react'
import { previewGroup } from './groups.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { shortDateTime } from '../../shared/lib/dates.js'
import PublicHeader from '../../shared/ui/PublicHeader.jsx'
import BrandGlow from '../../shared/ui/BrandGlow.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { MAIN_ID } from '../../shared/ui/SkipLink.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import { pluralise } from './groupFormat.js'

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

  if (data === undefined) return <RingLoader fullScreen />
  if (data === null) {
    return (
      <Flex direction="column" minH="100dvh" bg="bg.canvas">
        <PublicHeader />
        <Stack as="main" id={MAIN_ID} flex="1" spacing={4} textAlign="center" maxW="sm" w="full" mx="auto"
          px={4} pt={{ base: 16, md: 24 }}>
          <Heading as="h1" size="lg">Invite not found</Heading>
          <Text color="text.muted">This invite link is invalid or has expired.</Text>
          <Button as={RouterLink} to="/">Go to Budgeer</Button>
        </Stack>
      </Flex>
    )
  }

  // The anonymous preview (group_preview, 0051) only has the member count and
  // who invited you, never the members themselves: the inviter's initials,
  // then a "+N" for everyone else.
  const count = Number(data.member_count ?? 0)
  const others = Math.max(count - 1, 0)

  return (
    <Flex direction="column" minH="100dvh" bg="bg.canvas" overflowX="clip">
      <PublicHeader />

      <Box as="main" id={MAIN_ID} flex="1" position="relative" px={4} pb={10} maxW="600px" w="full" mx="auto">
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
            <Heading as="h1" size="lg">{data.group?.name}</Heading>
            <Text color="text.muted">{data.invited_by} invited you to this group</Text>
            <HStack justify="center" spacing={2} mt={3} color="text.muted" fontSize="sm">
              <HStack spacing={-2} aria-hidden>
                <UserAvatar size="sm" name={data.invited_by} borderWidth="2px" borderColor="bg.canvas" />
                {others > 0 && (
                  <Flex boxSize="32px" borderRadius="full" bg="bg.subtle" borderWidth="2px"
                    borderColor="bg.canvas" align="center" justify="center"
                    fontSize="xs" fontWeight="700" color="text.muted">
                    +{others}
                  </Flex>
                )}
              </HStack>
              <Text>{pluralise(count, 'member')}</Text>
            </HStack>
            {data.expires_at && (
              <Text fontSize="xs" color="text.muted" mt={1}>
                Invite expires {shortDateTime(data.expires_at)}
              </Text>
            )}
          </Box>

          <Text textAlign="center" fontSize="md">
            Budgeer splits shared costs and shows who owes whom — free.
          </Text>

          {/* The way in, right under the invite (not pinned to the bottom). */}
          <Stack spacing={3} bg="bg.surface" borderWidth="1px" borderColor="border.default"
            borderRadius="2xl" p={5} boxShadow="soft">
            <Stack direction={{ base: 'column', sm: 'row' }} spacing={3}>
              <Button flex={{ sm: 1 }} onClick={goSignup}>Create account &amp; join</Button>
              <Button flex={{ sm: 1 }} variant="outline" colorScheme="gray" onClick={goLogin}>Log in</Button>
            </Stack>
            <HStack justify="center" color="text.muted" fontSize="xs">
              <Lock size={12} /><Text>Create a free account to join and add expenses</Text>
            </HStack>
          </Stack>
        </Stack>
      </Box>
    </Flex>
  )
}
