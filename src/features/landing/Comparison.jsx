import { useState } from 'react'
import {
  Box, Button, Container, Heading, HStack, Link, SimpleGrid, Stack, Text,
} from '@chakra-ui/react'
import { ChevronDown, ExternalLink, Info, Layers, LockKeyhole, Sparkles } from 'lucide-react'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Unfold from '../../shared/ui/kit/Unfold.jsx'
import SectionHeading from './SectionHeading.jsx'
import {
  COMPARED_APPS, COMPARISON_CAVEAT, COMPARISON_CHECKED, COMPARISON_INTRO, COMPARISON_POINTS,
  COMPARISON_TITLE, sourceLabel,
} from './comparison.js'

const POINT_ICONS = { 'one-app': Layers, free: Sparkles, privacy: LockKeyhole }
const DETAIL_ID = 'comparison-detail'

function Point({ icon, tone, title, children, ...props }) {
  return (
    <Panel elevation="soft" {...props}>
      <Stack spacing={3}>
        <HStack spacing={3} align="center">
          <IconTile icon={icon} tone={tone} size={40} radius="xl" />
          <Heading as="h3" fontSize="lg" lineHeight="1.3">{title}</Heading>
        </HStack>
        <Text color="text.muted">{children}</Text>
      </Stack>
    </Panel>
  )
}

function Detail() {
  return (
    <Panel id={DETAIL_ID} elevation="soft" mt={4} p={{ base: 5, md: 6 }}>
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacingX={10} spacingY={6}>
        {COMPARED_APPS.map((app) => (
          <Stack key={app.name} spacing={2}>
            <Heading as="h3" fontSize="md">{app.name}</Heading>
            <Stack as="ul" listStyleType="none" spacing={2.5}>
              {app.facts.map((f) => (
                <Box as="li" key={f.text} fontSize="sm">
                  <Text as="span">{f.text} </Text>
                  <Link href={f.url} target="_blank" rel="noopener noreferrer" color="accent.fg"
                    fontWeight="600" whiteSpace="nowrap" aria-label={`Source: ${sourceLabel(f.url)} (opens in a new tab)`}>
                    {sourceLabel(f.url)}
                    <Box as="span" display="inline-block" ml={1} verticalAlign="-2px"><ExternalLink size={13} /></Box>
                  </Link>
                </Box>
              ))}
            </Stack>
          </Stack>
        ))}
      </SimpleGrid>
      <Text fontSize="xs" color="text.muted" mt={6}>
        Checked {COMPARISON_CHECKED.label} on each app’s own pages. Prices and plans change and can
        differ by country, so check the latest there. Product names belong to their owners.
      </Text>
    </Panel>
  )
}

export default function Comparison() {
  const [open, setOpen] = useState(false)
  return (
    <Box as="section">
      <Container maxW="6xl" px={{ base: 4, md: 6 }} py={{ base: 14, md: 20 }}>
        <SectionHeading eyebrow="Compared with others" title={COMPARISON_TITLE}>
          {COMPARISON_INTRO}
        </SectionHeading>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 4, md: 6 }} mt={{ base: 8, md: 12 }}>
          {COMPARISON_POINTS.map((p) => (
            <Point key={p.id} icon={POINT_ICONS[p.id]} title={p.title}>{p.body}</Point>
          ))}
          <Point icon={Info} tone="warning" title={COMPARISON_CAVEAT.title} bg="bg.subtle" elevation="none">
            {COMPARISON_CAVEAT.body}
          </Point>
        </SimpleGrid>
        <Button variant="ghost" mt={6} px={2} aria-expanded={open} aria-controls={DETAIL_ID}
          onClick={() => setOpen((o) => !o)}
          rightIcon={<Box as="span" transition="transform 0.2s" transform={open ? 'rotate(180deg)' : undefined}>
            <ChevronDown size={18} />
          </Box>}>
          {open ? 'Hide the detailed comparison' : 'See a detailed comparison'}
        </Button>
        <Unfold in={open} animateOpacity>
          <Detail />
        </Unfold>
      </Container>
    </Box>
  )
}
