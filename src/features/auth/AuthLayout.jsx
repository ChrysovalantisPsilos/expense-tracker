import { Link as RouterLink } from 'react-router-dom'
import {
  Box, Button, Card, CardBody, Flex, Heading, Stack, Text, VStack,
} from '@chakra-ui/react'
import { ArrowLeft } from 'lucide-react'
import PublicHeader from '../../shared/ui/PublicHeader.jsx'
import BrandGlow from '../../shared/ui/BrandGlow.jsx'
import { MAIN_ID } from '../../shared/ui/SkipLink.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Shared frame for the sign-in family of pages: the public header, the brand
// glow, and a centered card that opens with an optional icon tile, the page's
// h1 and a muted subline. Pages pass the rest of the card as `children`.
// `showHome` hides "Back to home" where it can't leave the page (mid password
// recovery, App renders ResetPassword on every route).
export default function AuthLayout({
  icon, iconColor = 'accent.fg', title, subtitle, showHome = true, children,
}) {
  const t = useT('auth')
  return (
    <Flex direction="column" minH="100dvh" bg="bg.canvas">
      <PublicHeader>
        {showHome && (
          <Button as={RouterLink} to="/" size="sm" variant="ghost" px={{ base: 2, sm: 3 }}
            leftIcon={<ArrowLeft size={16} />}>
            {t('backHome')}
          </Button>
        )}
      </PublicHeader>
      <Flex as="main" id={MAIN_ID} flex="1" position="relative" overflow="hidden"
        align="center" justify="center" px={4} pt={{ base: 6, md: 10 }} pb={{ base: 10, md: 16 }}>
        <BrandGlow top="50%" left="50%" transform="translate(-50%, -50%)"
          w={{ base: '160%', md: '900px' }} h="90%" />
        <Card maxW="sm" w="full" position="relative">
          <CardBody p={{ base: 5, sm: 6 }}>
            <Stack spacing={6}>
              <VStack spacing={3} textAlign="center" sx={{ textWrap: 'balance' }}>
                {icon && (
                  <Flex boxSize="56px" align="center" justify="center" borderRadius="2xl"
                    bg="bg.subtle" color={iconColor}>{icon}</Flex>
                )}
                <Box>
                  <Heading as="h1" fontSize="2xl" letterSpacing="-0.02em" lineHeight="1.2">
                    {title}
                  </Heading>
                  {subtitle && <Text color="text.muted" mt={1.5}>{subtitle}</Text>}
                </Box>
              </VStack>
              {children}
            </Stack>
          </CardBody>
        </Card>
      </Flex>
    </Flex>
  )
}
