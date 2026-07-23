import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Center, Card, CardBody, Stack, VStack, Flex, Heading, Text, Button,
  FormControl, FormLabel, Input, FormHelperText, useToast,
} from '@chakra-ui/react'
import { KeyRound, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { validatePassword } from '../../shared/lib/password.js'
import Logo from '../../shared/ui/Logo.jsx'

export default function ResetPassword() {
  const navigate = useNavigate()
  const toast = useToast()
  const { session, recovering, updatePassword, clearRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  // The recovery link establishes a session (and flips `recovering`). If neither
  // is present, the link was never opened here, or it expired/was already used.
  const canReset = recovering || !!session

  async function handleSubmit(e) {
    e.preventDefault()
    const err = validatePassword(password)
    if (err) { toast({ title: err, status: 'warning' }); return }
    if (password !== confirm) { toast({ title: 'Passwords don’t match.', status: 'warning' }); return }
    setBusy(true)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) {
      toast({ title: error.message || 'Couldn’t update your password — the link may have expired.', status: 'error' })
      return
    }
    clearRecovery()
    toast({ title: 'Password updated', status: 'success' })
    navigate('/', { replace: true })
  }

  if (!canReset) {
    return (
      <Center minH="100dvh" px={4}>
        <Card maxW="sm" w="full">
          <CardBody>
            <Stack spacing={6}>
              <VStack spacing={4}>
                <Logo size={36} />
                <Flex boxSize="56px" align="center" justify="center" borderRadius="2xl"
                  bg="bg.subtle" color="orange.400"><AlertTriangle size={28} /></Flex>
                <VStack spacing={1} textAlign="center">
                  <Heading size="md">Link expired or invalid</Heading>
                  <Text color="text.muted" fontSize="sm">
                    This password-reset link isn’t valid anymore. Reset links are
                    single-use and expire after a while — request a fresh one.
                  </Text>
                </VStack>
              </VStack>
              <Button onClick={() => navigate('/forgot-password')}>Request a new link</Button>
            </Stack>
          </CardBody>
        </Card>
      </Center>
    )
  }

  return (
    <Center minH="100dvh" px={4}>
      <Card maxW="sm" w="full">
        <CardBody>
          <Stack spacing={6}>
            <VStack spacing={3}>
              <Logo size={40} />
              <Flex boxSize="52px" align="center" justify="center" borderRadius="2xl"
                bg="bg.subtle" color="accent.fg"><KeyRound size={24} /></Flex>
              <Heading size="md">Choose a new password</Heading>
            </VStack>

            <form onSubmit={handleSubmit}>
              <Stack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>New password</FormLabel>
                  <Input type="password" autoComplete="new-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} />
                  <FormHelperText>At least 8 characters, with a letter and a number.</FormHelperText>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>Confirm new password</FormLabel>
                  <Input type="password" autoComplete="new-password" value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} />
                </FormControl>
                <Button type="submit" isLoading={busy} w="full">
                  Update password
                </Button>
              </Stack>
            </form>
          </Stack>
        </CardBody>
      </Card>
    </Center>
  )
}
