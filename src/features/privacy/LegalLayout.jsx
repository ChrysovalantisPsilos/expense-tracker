import { Link as RouterLink } from 'react-router-dom'
import {
  Box, Button, Container, HStack, Heading, Link, ListItem, Stack, Text, UnorderedList,
} from '@chakra-ui/react'
import { Languages } from 'lucide-react'
import BackButton from '../../shared/ui/BackButton.jsx'
import Eyebrow from '../../shared/ui/Eyebrow.jsx'
import HobbyNotice from '../../shared/ui/HobbyNotice.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import PublicHeader from '../../shared/ui/PublicHeader.jsx'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useInAppShell } from '../../shared/ui/inAppShell.js'
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { formatVersion } from './legal.js'
import { MAIN_ID } from '../../shared/ui/SkipLink.jsx'

// Above a translated document: it's a translation for convenience, the
// English version prevails, and a link to it. Above the English original
// opened from there (in another app language): a way back, in that language.
function LanguageNote({ doc }) {
  const t = useT('privacy')
  if (doc.lang === 'en' && doc.appLang === 'en') return null
  const translated = doc.lang !== 'en'
  return (
    <Box role="note" lang={translated ? undefined : doc.appLang} bg="bg.subtle" borderWidth="1px"
      borderColor="border.default" borderLeftWidth="4px" borderLeftColor="brand.500" borderRadius="xl" p={4}>
      <HStack spacing={3} align="flex-start">
        <Box color="accent.fg" pt={0.5} flexShrink={0}><Languages size={18} aria-hidden /></Box>
        <Text fontSize="sm" lineHeight="1.6">
          <Trans t={translated ? doc.t : t} k={translated ? 'layout.translated' : 'layout.original'}
            components={{ link: <Link as={RouterLink} to={{ search: translated ? '?lang=en' : '' }}
              variant="inline" fontWeight="600" /> }} />
        </Text>
      </HStack>
    </Box>
  )
}

// A section heading: "3. Who receives it".
const numbered = (n, title) => `${n}. ${title}`

// The document itself: the language note, intro, the hobby-project notice,
// version and effective date, a table of contents, then numbered sections.
function Document({ doc, intro, version, sections }) {
  const { t } = doc
  // The English original keeps its English date in any app language.
  const date = formatVersion(version, doc.lang === doc.appLang ? undefined : 'en-GB')
  return (
    <Stack spacing={{ base: 10, md: 12 }}>
      <Stack spacing={4}>
        <LanguageNote doc={doc} />
        <Text color="text.muted" fontSize={{ base: 'md', md: 'lg' }} lineHeight="1.7">{intro}</Text>
        <HobbyNotice />
        <Stack spacing={1}>
          <Text fontSize="sm" color="text.muted">
            <Trans t={t} k="layout.version" values={{ version, date }}
              components={{ time: <time dateTime={version} /> }} />
          </Text>
          <Text fontSize="sm" color="text.muted">
            <Trans t={t} k="layout.help"
              components={{ link: <Link as={RouterLink} to="/help" variant="inline" fontWeight="600" /> }} />
          </Text>
        </Stack>
      </Stack>

      <Box as="nav" aria-label={t('layout.contents')}>
        <Text fontWeight="700" mb={2}>{t('layout.contents')}</Text>
        <Box as="ol" pl={5} color="text.muted" lineHeight="1.9">
          {sections.map((s) => (
            <li key={s.id}><Link href={`#${s.id}`} color="accent.fg">{s.title}</Link></li>
          ))}
        </Box>
      </Box>

      {sections.map((s, i) => (
        <Stack as="section" key={s.id} id={s.id} spacing={3} scrollMarginTop="80px">
          <Heading as="h2" fontSize={{ base: 'xl', md: '2xl' }} letterSpacing="-0.02em" lineHeight="1.2">
            {numbered(i + 1, s.title)}
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
// `doc` is useLegalText(): the document's words and language, which can be
// the English original while the app around it is in another language.
export default function LegalLayout({ doc, eyebrow, title, intro, version, sections }) {
  const t = useT()
  const { user } = useAuth()
  const inShell = useInAppShell()
  // Marks the English original as English inside a page in another language.
  const lang = doc.lang === doc.appLang ? undefined : doc.lang
  const body = <Document doc={doc} intro={intro} version={version} sections={sections} />

  if (inShell) {
    return (
      <Stack spacing={6} lang={lang}>
        <PageHeader eyebrow={eyebrow} title={title} leading={<BackButton fallback="/settings" />} />
        {body}
      </Stack>
    )
  }

  return (
    <Box minH="100dvh" bg="bg.canvas" overflowX="clip">
      <PublicHeader>
        {!user && (
          <>
            <Button as={RouterLink} to="/login" size="sm" variant="ghost" px={{ base: 2, sm: 3 }}>{t('actions.logIn')}</Button>
            <Button as={RouterLink} to="/login?signup=1" size="sm" px={{ base: 3, sm: 4 }}>{t('actions.signUp')}</Button>
          </>
        )}
      </PublicHeader>

      <Container as="main" id={MAIN_ID} maxW="3xl" px={{ base: 4, md: 6 }} pt={{ base: 4, md: 8 }} pb={{ base: 10, md: 16 }}>
        <Stack spacing={6} lang={lang}>
          <Stack spacing={3}>
            <BackButton fallback="/" />
            <Eyebrow fontSize="sm" lineHeight="base">{eyebrow}</Eyebrow>
            <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} letterSpacing="-0.03em" lineHeight="1.1">
              {title}
            </Heading>
          </Stack>
          {body}
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
