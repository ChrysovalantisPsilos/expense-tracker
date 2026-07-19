import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Center, Spinner, Stack, Text, Button, Heading } from '@chakra-ui/react'
import { acceptInvite } from '../lib/groups.js'

export default function JoinGroup() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    acceptInvite(token)
      .then((gid) => { if (active) navigate(`/groups/${gid}`, { replace: true }) })
      .catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [token, navigate])

  if (error) {
    return (
      <Center h="100dvh" px={4}>
        <Stack spacing={4} textAlign="center" maxW="sm">
          <Heading size="md">Couldn’t join</Heading>
          <Text color="text.muted">{error}</Text>
          <Button onClick={() => navigate('/groups')}>Go to groups</Button>
        </Stack>
      </Center>
    )
  }
  return (
    <Center h="100dvh">
      <Stack align="center" spacing={3}>
        <Spinner color="brand.500" size="lg" />
        <Text color="text.muted">Joining group…</Text>
      </Stack>
    </Center>
  )
}
