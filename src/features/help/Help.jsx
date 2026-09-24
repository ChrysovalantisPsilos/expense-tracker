import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Accordion, AccordionButton, AccordionIcon, AccordionItem, AccordionPanel,
  Box, Button, Container, Heading, IconButton, Input, InputGroup, InputLeftElement,
  InputRightElement, Link, ListItem, OrderedList, Stack, Text, useToast,
} from '@chakra-ui/react'
import { Link as LinkIcon, Search, X } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import BackButton from '../../shared/ui/BackButton.jsx'
import Eyebrow from '../../shared/ui/Eyebrow.jsx'
import HobbyNotice from '../../shared/ui/HobbyNotice.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import PublicHeader from '../../shared/ui/PublicHeader.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { DISCLAIMER } from '../../shared/lib/disclaimer.js'
import { CURRENT_ENV, shareOrigin } from '../../shared/lib/environment.js'
import { FAQ_SECTIONS } from './faqContent.js'
import FaqClip from './FaqClip.jsx'
import InstallIllustration from './InstallIllustration.jsx'
import {
  anchorFromHash, applyOpenIndexes, countItems, filterFaq, openIndexes, questionLink,
} from './faqMath.js'

const PATH = '/help'
const INTRO = 'Answers to the questions people ask most. Search, or browse by topic.'

// An answer's optional illustration: an install sketch or a clip of the app.
function Media({ media }) {
  if (media.type === 'install') return <InstallIllustration platform={media.platform} />
  return <FaqClip name={media.name} alt={media.alt} />
}

// One section's questions as an accessible accordion (each question is an h3
// button; arrow keys, Home and End move between them). `open` is the page's
// set of open question ids, so a #link can open any item.
function FaqSection({ section, open, onOpenChange, onCopyLink }) {
  return (
    <Panel as="section" aria-labelledby={`section-${section.id}`} p={{ base: 2, md: 3 }}>
      <Heading as="h2" id={`section-${section.id}`} size="sm" lineHeight="1.5"
        px={{ base: 2, md: 3 }} pt={2} pb={1}>
        {section.title}
      </Heading>
      <Accordion allowMultiple index={openIndexes(section.items, open)}
        onChange={(indexes) => onOpenChange(section.items, indexes)}>
        {section.items.map((item, i) => (
          <AccordionItem key={item.id}
            borderTopWidth={i === 0 ? 0 : '1px'} borderBottomWidth={0} _last={{ borderBottomWidth: 0 }}
            borderColor="border.default">
            {/* The #anchor sits on the heading: AccordionItem uses `id` for its own ids. */}
            <Heading as="h3" id={item.id} scrollMarginTop="80px" fontSize="md" fontWeight="600" lineHeight="1.4">
              <AccordionButton px={{ base: 2, md: 3 }} py={3} borderRadius="lg" textAlign="left"
                gap={3} _hover={{ bg: 'bg.subtle' }}>
                <Box as="span" flex="1" minW={0}>{item.q}</Box>
                <AccordionIcon color="text.muted" flexShrink={0} />
              </AccordionButton>
            </Heading>
            <AccordionPanel px={{ base: 2, md: 3 }} pt={0} pb={4}>
              <Stack spacing={2.5}>
                {item.a.map((p, j) => (
                  <Text key={j} color="text.muted" lineHeight="1.7">{p}</Text>
                ))}
                {item.steps && (
                  <OrderedList spacing={1.5} pl={1} color="text.muted" lineHeight="1.7">
                    {item.steps.map((step) => <ListItem key={step}>{step}</ListItem>)}
                  </OrderedList>
                )}
                {item.media && <Media media={item.media} />}
                <Box>
                  <Button size="xs" variant="ghost" ml={-2} leftIcon={<LinkIcon size={14} />}
                    onClick={() => onCopyLink(item.id)}>
                    Copy link to this answer
                  </Button>
                </Box>
              </Stack>
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </Panel>
  )
}

// Search box, result count, the sections, and the disclaimer. Owns which
// questions are open and follows the URL's #anchor.
function FaqBody() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const sections = useMemo(() => filterFaq(FAQ_SECTIONS, query), [query])
  const total = countItems(sections)

  // A #question link opens that answer and scrolls to it (clearing any search
  // that would hide it). Runs on first load and whenever the hash changes.
  useEffect(() => {
    const id = anchorFromHash(hash, FAQ_SECTIONS)
    if (!id) return
    setQuery('')
    setOpen((prev) => new Set(prev).add(id))
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(id)
      el?.scrollIntoView({ block: 'start' })
      el?.querySelector('button')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [hash])

  function onOpenChange(items, indexes) {
    setOpen((prev) => applyOpenIndexes(prev, items, indexes))
  }

  async function onCopyLink(id) {
    navigate({ hash: id }, { replace: true })
    try {
      await navigator.clipboard.writeText(questionLink(shareOrigin(CURRENT_ENV, window.location.origin), PATH, id))
      toast({ title: 'Link copied', status: 'success', duration: 2000 })
    } catch {
      toast({ title: 'The link is in the address bar', status: 'info', duration: 3000 })
    }
  }

  return (
    <Stack spacing={5}>
      <HobbyNotice />
      <Box role="search">
        <InputGroup size="lg">
          <InputLeftElement pointerEvents="none" color="text.muted"><Search size={18} /></InputLeftElement>
          <Input type="search" enterKeyHint="search" aria-label="Search questions"
            placeholder="Search questions" value={query} bg="bg.surface"
            sx={{ '&::-webkit-search-cancel-button': { display: 'none' } }}
            onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <InputRightElement>
              <IconButton aria-label="Clear search" size="sm" variant="ghost"
                icon={<X size={16} />} onClick={() => setQuery('')} />
            </InputRightElement>
          )}
        </InputGroup>
        <Text aria-live="polite" fontSize="sm" color="text.muted" mt={2} minH="1.5em">
          {query.trim() ? `${total} ${total === 1 ? 'answer' : 'answers'} found` : ''}
        </Text>
      </Box>

      {sections.map((section) => (
        <FaqSection key={section.id} section={section} open={open}
          onOpenChange={onOpenChange} onCopyLink={onCopyLink} />
      ))}

      {total === 0 && (
        <Panel textAlign="center">
          <Text fontWeight="600">No answers match “{query.trim()}”.</Text>
          <Text color="text.muted" fontSize="sm" mt={1}>Try other words, or browse all the questions.</Text>
          <Button size="sm" variant="outline" mt={4} onClick={() => setQuery('')}>Show all questions</Button>
        </Panel>
      )}

      <Text fontSize="sm" color="text.muted" textAlign="center" pt={2}>
        {DISCLAIMER} See also the{' '}
        <Link as={RouterLink} to="/privacy" variant="inline" fontWeight="600">Privacy page</Link>.
      </Text>
    </Stack>
  )
}

// Help & FAQ, readable signed in or out: inside the app shell (with a way
// back to where the user came from, else Settings) when signed in, on the
// public layout when signed out.
export default function Help() {
  const { user } = useAuth()

  if (user) {
    return (
      <Stack spacing={5}>
        <PageHeader eyebrow="Help" title="Help & FAQ" description={INTRO}
          leading={<BackButton fallback="/settings" />} />
        <FaqBody />
      </Stack>
    )
  }

  return (
    <Box minH="100dvh" bg="bg.canvas" overflowX="clip">
      <PublicHeader>
        <Button as={RouterLink} to="/login" size="sm" variant="ghost" px={{ base: 2, sm: 3 }}>Log in</Button>
        <Button as={RouterLink} to="/login?signup=1" size="sm" px={{ base: 3, sm: 4 }}>Get started</Button>
      </PublicHeader>
      <Container as="main" maxW="3xl" px={{ base: 4, md: 6 }} py={{ base: 10, md: 16 }}>
        <Stack spacing={{ base: 8, md: 10 }}>
          <Stack spacing={3}>
            <Eyebrow fontSize="sm" lineHeight="base">Help</Eyebrow>
            <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} letterSpacing="-0.03em" lineHeight="1.1">
              Frequently asked questions
            </Heading>
            <Text color="text.muted" fontSize={{ base: 'md', md: 'lg' }} lineHeight="1.7">{INTRO}</Text>
          </Stack>
          <FaqBody />
        </Stack>
      </Container>
    </Box>
  )
}
