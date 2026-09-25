import { Link as RouterLink } from 'react-router-dom'
import {
  Box, Button, Container, Heading, Link, ListItem, Stack, Text, UnorderedList,
} from '@chakra-ui/react'
import BackButton from '../../shared/ui/BackButton.jsx'
import Eyebrow from '../../shared/ui/Eyebrow.jsx'
import HobbyNotice from '../../shared/ui/HobbyNotice.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import PublicHeader from '../../shared/ui/PublicHeader.jsx'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useInAppShell } from '../../shared/ui/inAppShell.js'
import { formatVersion } from './legal.js'
import { MAIN_ID } from '../../shared/ui/SkipLink.jsx'

// The document itself: intro, the hobby-project notice, version and
// effective date, a table of contents, then numbered sections.
function Document({ intro, version, sections }) {
  return (
    <Stack spacing={{ base: 10, md: 12 }}>
      <Stack spacing={4}>
        <Text color="text.muted" fontSize={{ base: 'md', md: 'lg' }} lineHeight="1.7">{intro}</Text>
        <HobbyNotice />
        <Stack spacing={1}>
          <Text fontSize="sm" color="text.muted">
            Version <time dateTime={version}>{version}</time> · effective {formatVersion(version)}
          </Text>
          <Text fontSize="sm" color="text.muted">
            Questions about using the app? See{' '}
            <Link as={RouterLink} to="/help" variant="inline" fontWeight="600">Help &amp; FAQ</Link>.
          </Text>
        </Stack>
      </Stack>

      <Box as="nav" aria-label="Contents">
        <Text fontWeight="700" mb={2}>Contents</Text>
        <Box as="ol" pl={5} color="text.muted" lineHeight="1.9">
          {sections.map((s) => (
            <li key={s.id}><Link href={`#${s.id}`} color="accent.fg">{s.title}</Link></li>
          ))}
        </Box>
      </Box>

      {sections.map((s, i) => (
        <Stack as="section" key={s.id} id={s.id} spacing={3} scrollMarginTop="80px">
          <Heading as="h2" fontSize={{ base: 'xl', md: '2xl' }} letterSpacing="-0.02em" lineHeight="1.2">
            {i + 1}. {s.title}
          </Heading>
          {s.body}
        </Stack>
      ))}
    </Stack>
  )
}

// The frame shared by the Privacy Notice and the Terms of Use, readable signed
// in or out. In the app shell it sits like Help & FAQ, with a back button to
// where the user came from (else Settings); outside it (signed out, or opened
// from the legal prompt before the app is open) it's on the public layout,
// with a back button to the previous page (else the landing, or the prompt).
export default function LegalLayout({ eyebrow, title, intro, version, sections }) {
  const { user } = useAuth()
  const inShell = useInAppShell()
  const doc = <Document intro={intro} version={version} sections={sections} />

  if (inShell) {
    return (
      <Stack spacing={6}>
        <PageHeader eyebrow={eyebrow} title={title} leading={<BackButton fallback="/settings" />} />
        {doc}
      </Stack>
    )
  }

  return (
    <Box minH="100dvh" bg="bg.canvas" overflowX="clip">
      <PublicHeader>
        {!user && (
          <>
            <Button as={RouterLink} to="/login" size="sm" variant="ghost" px={{ base: 2, sm: 3 }}>Log in</Button>
            <Button as={RouterLink} to="/login?signup=1" size="sm" px={{ base: 3, sm: 4 }}>Sign up</Button>
          </>
        )}
      </PublicHeader>

      <Container as="main" id={MAIN_ID} maxW="3xl" px={{ base: 4, md: 6 }} pt={{ base: 4, md: 8 }} pb={{ base: 10, md: 16 }}>
        <Stack spacing={6}>
          <Stack spacing={3}>
            <BackButton fallback="/" />
            <Eyebrow fontSize="sm" lineHeight="base">{eyebrow}</Eyebrow>
            <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} letterSpacing="-0.03em" lineHeight="1.1">
              {title}
            </Heading>
          </Stack>
          {doc}
        </Stack>
      </Container>
    </Box>
  )
}

export function Body({ children }) {
  return <Text color="text.muted" lineHeight="1.7">{children}</Text>
}

export function Bullets({ items }) {
  return (
    <UnorderedList spacing={2} pl={1} color="text.muted" lineHeight="1.7">
      {items.map((item, i) => <ListItem key={i}>{item}</ListItem>)}
    </UnorderedList>
  )
}

export function Lead({ children }) {
  return <Text as="strong" color="text.primary" fontWeight="700">{children}</Text>
}

// A list of labelled facts (instead of a table, so it reads on a phone):
// each entry has a bold `name` and `lines` of "Label: value".
export function Facts({ items }) {
  return (
    <Stack spacing={3}>
      {items.map((it) => (
        <Box key={it.name} borderWidth="1px" borderColor="border.default" borderRadius="xl" p={4} bg="bg.surface">
          <Text fontWeight="700" mb={1}>{it.name}</Text>
          <Stack spacing={1}>
            {it.lines.map(([label, value]) => (
              <Text key={label} fontSize="sm" color="text.muted" lineHeight="1.6">
                <Text as="span" color="text.primary" fontWeight="600">{label}:</Text> {value}
              </Text>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  )
}

export function MailLink({ to }) {
  return <Link href={`mailto:${to}`} variant="inline">{to}</Link>
}

export function PageLink({ to, children }) {
  return <Link as={RouterLink} to={to} variant="inline">{children}</Link>
}
