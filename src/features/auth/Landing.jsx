import { useNavigate } from 'react-router-dom'
import {
  Box, Center, Stack, HStack, Heading, Text, Button, Image, useColorMode,
  IconButton, Flex, Icon,
} from '@chakra-ui/react'
import { Sun, Moon, ReceiptText, Users, Camera } from 'lucide-react'

function Feature({ icon, children }) {
  return (
    <HStack spacing={2} color="text.muted">
      <Icon as={icon} boxSize={4} color="accent.fg" />
      <Text fontSize="sm">{children}</Text>
    </HStack>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const { colorMode, toggleColorMode } = useColorMode()
  const ThemeIcon = colorMode === 'dark' ? Sun : Moon

  return (
    <Flex direction="column" minH="100dvh" bg="bg.canvas">
      <Flex px={5} py={4} align="center">
        <HStack spacing={2.5}>
          <Image src="/budge-mark.svg" alt="Budge" boxSize="30px" />
          <Text fontFamily="heading" fontWeight="700" fontSize="xl" letterSpacing="-0.02em">
            budge
          </Text>
        </HStack>
        <Box flex="1" />
        <IconButton aria-label="Toggle theme" variant="ghost" size="sm"
          icon={<ThemeIcon size={18} />} onClick={toggleColorMode} />
      </Flex>

      <Center flex="1" px={6}>
        <Stack spacing={7} maxW="440px" textAlign="center" align="center" pb="10vh">
          <Image src="/budge-mark.svg" alt="" boxSize="72px" />
          <Stack spacing={3}>
            <Heading size="2xl" letterSpacing="-0.03em" lineHeight="1.05">
              Track your money.<br />Split with friends.
            </Heading>
            <Text color="text.muted" fontSize="lg">
              Log every expense, set budgets, scan receipts, and settle up with
              friends — all in one warm little app.
            </Text>
          </Stack>

          <HStack spacing={5} flexWrap="wrap" justify="center">
            <Feature icon={ReceiptText}>Track &amp; budget</Feature>
            <Feature icon={Users}>Split fairly</Feature>
            <Feature icon={Camera}>Scan receipts</Feature>
          </HStack>

          <Stack spacing={3} w="full" maxW="280px" pt={2}>
            <Button size="lg" onClick={() => navigate('/login?signup=1')}>Get started</Button>
            <Button size="lg" variant="ghost" onClick={() => navigate('/login')}>
              I already have an account
            </Button>
          </Stack>
        </Stack>
      </Center>

      <Center pb={6}>
        <Text fontSize="xs" color="text.muted">Budge · your money, your friends, sorted</Text>
      </Center>
    </Flex>
  )
}
