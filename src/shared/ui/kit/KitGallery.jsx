import { Box, Button, Container, Divider, Heading, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import {
  Coffee, Pencil, Plane, Receipt, ShoppingCart, Trash2, TrendingUp, UtensilsCrossed, Wallet,
} from 'lucide-react'
import ThemeToggle from '../ThemeToggle.jsx'
import Panel from './Panel.jsx'
import Tile from './Tile.jsx'
import IconTile from './IconTile.jsx'
import Figure from './Figure.jsx'
import SectionLabel from './SectionLabel.jsx'
import HighlightPill from './HighlightPill.jsx'
import ItemRow from './ItemRow.jsx'
import ProgressRow from './ProgressRow.jsx'
import TrendBars from './TrendBars.jsx'
import ConversionRow from './ConversionRow.jsx'
import TransferRow from './TransferRow.jsx'
import { BalanceGrid, BalanceTile } from './Balances.jsx'
import { ShareLegend, StackedBar } from './ShareBar.jsx'
import { signedAmount } from './kitMath.js'
import { usePlayback } from './motion.jsx'

// Dev-only gallery (/kit, only when import.meta.env.DEV): every kit component
// with sample props, for screenshots and for building screens. Sample values
// are plain strings; real screens format with shared/lib/currency.
const eur = (minor) => `€${(Math.abs(minor) / 100).toFixed(2)}`
const SHARES = [
  { label: 'Housing', share: 58 }, { label: 'Groceries', share: 19 }, { label: 'Dining out', share: 11 },
  { label: 'Transport', share: 4 }, { label: 'Other', share: 8 },
]
const BARS = [['Apr', 158020], ['May', 171275], ['Jun', 165530], ['Jul', 189010], ['Aug', 174260], ['Sep', 163500]]
  .map(([label, value]) => ({ label, value }))
const noop = () => {}
const ACTIONS = [
  { label: 'Edit', icon: Pencil, onClick: noop },
  { label: 'Delete', icon: Trash2, danger: true, onClick: noop },
]

function Spec({ name, children }) {
  return (
    <Stack spacing={2}>
      <Text fontFamily="mono" fontSize="xs" color="text.muted">{name}</Text>
      {children}
    </Stack>
  )
}

function AnimatedDemo() {
  const playback = usePlayback({ once: true })
  return (
    <Panel ref={playback.ref} title="Animated (playback)" subtitle="Same components, with usePlayback">
      <Stack spacing={4}>
        <ProgressRow icon={ShoppingCart} title="Groceries" meta="€312.40 of €400.00" percent={78} playback={playback} />
        <StackedBar items={SHARES} playback={playback} />
        <TrendBars bars={BARS} playback={playback} h="80px" />
        <ConversionRow label="Train to London" rate={1.17} from="£42.50" to="€49.73" playback={playback} delay={0.3} />
      </Stack>
    </Panel>
  )
}

export default function KitGallery() {
  return (
    <Box minH="100dvh" bg="bg.canvas" py={{ base: 6, md: 10 }}>
      <Container maxW="6xl" px={{ base: 4, md: 6 }}>
        <HStack justify="space-between" mb={6}>
          <Heading as="h1" size="lg">UI kit</Heading>
          <ThemeToggle />
        </HStack>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} alignItems="start">
          <Panel title="Panel" eyebrow="Eyebrow" icon={Wallet} subtitle="Subtitle, icon and action"
            action={<Button size="xs" variant="ghost">Action</Button>}>
            <Stack spacing={4}>
              <Spec name="Panel — nested, elevation=none">
                <Panel title="Nested panel" elevation="none" p={4}><Text fontSize="sm">elevation=&quot;none&quot;</Text></Panel>
              </Spec>
              <Spec name="Tile">
                <Tile><Text fontSize="sm">Sand inner tile</Text></Tile>
              </Spec>
              <Spec name="IconTile — subtle 32 · positive 32 · 40 xl · solid 40">
                <HStack spacing={3}>
                  <IconTile icon={Receipt} />
                  <IconTile icon={TrendingUp} tone="positive" />
                  <IconTile icon={Coffee} size={40} radius="xl" />
                  <IconTile icon={Plane} size={40} radius="xl" variant="solid" />
                </HStack>
              </Spec>
            </Stack>
          </Panel>

          <Panel title="Figure">
            <Stack spacing={4}>
              <HStack justify="space-between" align="start">
                <Figure label="Total" value="€357.00" />
                <Figure label="Spent this month" value="€1,635.00" size="lg" />
                <Figure label="Net" value="+€162.75" tone="positive" align="right" />
              </HStack>
              <Figure label="Balance" value="€12,480.00" size="xl" />
              <Divider />
              <Figure layout="inline" label="Total" value="€234.77" />
            </Stack>
          </Panel>

          <Panel title="Balances">
            <Stack spacing={3}>
              <SectionLabel>Balances</SectionLabel>
              <BalanceGrid>
                {[['You', 16275], ['Anna', -285], ['Marco', -7065], ['Sofia', 0]].map(([name, minor]) => {
                  const { text, tone } = signedAmount(minor, eur)
                  return <BalanceTile key={name} label={name} value={text} tone={tone} />
                })}
              </BalanceGrid>
              <HighlightPill amount="€89.25">Sofia owes you</HighlightPill>
              <HighlightPill>You’re all settled up</HighlightPill>
            </Stack>
          </Panel>

          <Panel title="ItemRow">
            <ItemRow icon={Receipt} title="Airbnb" meta="Paid by You" amount="€240.00" />
            <ItemRow icon={Receipt} title="Dinner at Time Out" meta="Paid by Anna" amount="€86.40" />
            <ItemRow icon={Wallet} title="Salary" meta="1 Sep · Income" amount="+€2,400.00" amountTone="positive" />
            <ItemRow icon={Coffee} title="Coffee in London" meta="2 Sep · Dining out" amount="£3.20"
              amountMeta="≈ €3.74" actions={ACTIONS} actionSlots={2} />
            <ItemRow icon={Receipt} title="Clickable row" meta="onClick makes it a button" amount="€12.00" onClick={noop} />
          </Panel>

          <Panel title="ProgressRow">
            <Stack spacing={4}>
              <ProgressRow icon={ShoppingCart} title="Groceries" meta="€312.40 of €400.00" percent={78} />
              <ProgressRow icon={Coffee} title="Coffee" meta="€41.00 of €50.00" percent={82} tone="warning" />
              <ProgressRow icon={UtensilsCrossed} title="Dining out" meta="€186.90 of €150.00" percent={125} />
              <ProgressRow icon={TrendingUp} title="Emergency fund" meta="€3,000 of €3,000" percent={100}
                tone="positive" valueLabel="Reached" actions={ACTIONS} actionSlots={2} />
            </Stack>
          </Panel>

          <Panel title="StackedBar + ShareLegend">
            <StackedBar items={SHARES} />
            <ShareLegend items={SHARES} mt={3} />
          </Panel>

          <Panel title="TrendBars">
            <SectionLabel mb={3} aside="Sep: €1,635.00">Last 6 months</SectionLabel>
            <TrendBars bars={BARS} />
          </Panel>

          <Panel title="ConversionRow">
            <Stack spacing={3}>
              <ConversionRow label="Train to London" rate={1.17} from="£42.50" to="€49.73" />
              <ConversionRow label="Ramen in Tokyo" rate={0.0062} from="¥1,800" to="€11.16" />
            </Stack>
          </Panel>

          <Panel title="TransferRow">
            <Stack spacing={3}>
              <SectionLabel>Settle up · 2 payments</SectionLabel>
              <TransferRow from={{ name: 'Sofia' }} to={{ name: 'You', highlight: true }} amount="€89.25" />
              <TransferRow from={{ name: 'You', highlight: true }} to={{ name: 'Marco' }} amount="€70.65"
                amountTone="default" action={<Button size="xs">Mark paid</Button>} />
            </Stack>
          </Panel>

          <AnimatedDemo />
        </SimpleGrid>
      </Container>
    </Box>
  )
}
