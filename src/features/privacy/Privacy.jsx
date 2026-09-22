import { Link as RouterLink } from 'react-router-dom'
import {
  Box, Button, Container, Heading, ListItem, Stack, Text, UnorderedList,
} from '@chakra-ui/react'
import Eyebrow from '../../shared/ui/Eyebrow.jsx'
import PublicHeader from '../../shared/ui/PublicHeader.jsx'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'

// Plain-language privacy page, readable signed in or out. Every statement here
// must stay true to the code and migrations — update it alongside any change to
// storage, encryption, sharing, third-party services or account deletion.

const LAST_UPDATED = { iso: '2026-09-22', label: '22 September 2026' }

// ===========================================================================
// EDIT HERE: "What we store" and "What's encrypted".
// Keep in step with the encryption migrations (0046, 0047, 0050).
// `lead` renders bold; `text` follows it.
// ===========================================================================

const STORED_INTRO =
  'Your data is stored with Supabase, a hosted database and sign-in service. It travels between your device and the app over encrypted (HTTPS) connections. We store:'

const STORED = [
  { lead: 'Your account:', text: 'email address, name, profile picture, main currency and notification settings.' },
  { lead: 'Your money:', text: 'expenses and income (amount, currency, description, notes, date and category), your categories and auto-categorising rules, accounts, budgets, savings goals and recurring payments.' },
  { lead: 'Groups:', text: 'the group’s name and picture, its members, shared expenses and how they’re split, settlements, comments, and a log of changes.' },
  { lead: 'Notifications', text: 'sent to you and, if you enable push, a delivery address for each device.' },
]

const STORED_READABLE_NOTE =
  'Amounts, descriptions, notes and comments are encrypted (see the next section). The rest is stored in readable form.'

const ON_DEVICE = [
  'Some work happens only on your device.',
  'Receipt scans are read on your device to fill in the amount and date. The photo isn’t uploaded or kept, and the text-recognition engine is downloaded from budgeer.com itself.',
  'When you import a spreadsheet, the file is read in your browser and only the transactions you import are saved.',
  'So it can open offline, the app keeps a copy of some recently loaded data on your device; signing out clears it.',
]

const ENCRYPTED_INTRO =
  'Your amounts and what you spent them on are encrypted in the database, with a key kept separately in Supabase Vault. That covers:'

const ENCRYPTED = [
  'Expense and income amounts, descriptions and notes',
  'Group expense amounts and descriptions, and each person’s share of a split',
  'Settlement amounts and notes',
  'Group comments',
  'Recurring payment amounts and descriptions',
  'The group change log’s summaries and amounts',
  'Account balances, budget amounts, and savings goal targets and amounts saved',
  'Payment details you add for settling up (IBAN and Revolut tag)',
]

const ENCRYPTED_PLAIN =
  'Dates, categories, currencies and exchange rates stay readable, and so do names: of your accounts, categories and goals, of groups, and of group members. That lets the app sort and filter your data.'

const ENCRYPTED_LIMITS =
  'This protects your data if a database backup or copy ever leaked: without the key, those values are unreadable. It is not end-to-end encryption. The app’s server can decrypt them to show them to you, and to show group details and your payment details to people in your groups.'

// ===========================================================================

const SERVICES = [
  {
    name: 'Supabase',
    what: 'Our database, sign-in, file storage (profile and group pictures) and server functions. It stores everything described on this page. Your data goes from the app straight to Supabase.',
  },
  {
    name: 'Vercel',
    what: 'Hosts the website and the app’s files. The data you enter doesn’t pass through it.',
  },
  {
    name: 'Google',
    what: 'Only if you use “Sign in with Google”. Google confirms who you are and shares your name, email address and profile picture with Budgeer.',
  },
  {
    name: 'Resend',
    what: 'Sends our emails. When you invite someone by email, it receives their address, your name and the group’s name. If email notifications are on, it receives your address and a short notice about group invites or members joining or leaving, naming the people and the group. Emails never include amounts or descriptions.',
  },
  {
    name: 'Your browser’s push service',
    what: 'If you turn on push notifications, they’re delivered through the push service run by your browser’s maker (for example Google, Apple or Mozilla). Notifications say what happened and who did it, such as “Alex added an expense”, but never include amounts or descriptions. The message is encrypted so only your device can read it.',
  },
  {
    name: 'An exchange-rate service',
    what: 'When you enter an amount in another currency, the app looks up that day’s rate. Only the two currency codes are sent, never the amount or what it was for.',
  },
]

function Section({ title, children }) {
  return (
    <Stack as="section" spacing={3}>
      <Heading as="h2" fontSize={{ base: 'xl', md: '2xl' }} letterSpacing="-0.02em" lineHeight="1.2">
        {title}
      </Heading>
      {children}
    </Stack>
  )
}

function Body({ children }) {
  return <Text color="text.muted" lineHeight="1.7">{children}</Text>
}

function Bullets({ items }) {
  return (
    <UnorderedList spacing={2} pl={1} color="text.muted" lineHeight="1.7">
      {items.map((item, i) => <ListItem key={i}>{item}</ListItem>)}
    </UnorderedList>
  )
}

function Lead({ children }) {
  return <Text as="strong" color="text.primary" fontWeight="700">{children}</Text>
}

export default function Privacy() {
  const { user } = useAuth()

  return (
    <Box minH="100dvh" bg="bg.canvas" overflowX="clip">
      <PublicHeader>
        {user ? (
          <Button as={RouterLink} to="/" size="sm">Open Budgeer</Button>
        ) : (
          <>
            <Button as={RouterLink} to="/login" size="sm" variant="ghost" px={{ base: 2, sm: 3 }}>Log in</Button>
            <Button as={RouterLink} to="/login?signup=1" size="sm" px={{ base: 3, sm: 4 }}>Get started</Button>
          </>
        )}
      </PublicHeader>

      <Container as="main" maxW="3xl" px={{ base: 4, md: 6 }} py={{ base: 10, md: 16 }}>
        <Stack spacing={{ base: 10, md: 12 }}>
          <Stack spacing={3}>
            <Eyebrow fontSize="sm" lineHeight="base">Privacy</Eyebrow>
            <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} letterSpacing="-0.03em" lineHeight="1.1">
              How Budgeer handles your data
            </Heading>
            <Text color="text.muted" fontSize={{ base: 'md', md: 'lg' }} lineHeight="1.7">
              Budgeer is a free expense tracker and bill splitter. This page explains, in
              plain language, what we store, what’s encrypted, who can see it, and which
              outside services are involved. It isn’t a legal document.
            </Text>
            <Text fontSize="sm" color="text.muted">
              Last updated <time dateTime={LAST_UPDATED.iso}>{LAST_UPDATED.label}</time>
            </Text>
          </Stack>

          <Section title="The short version">
            <Bullets items={[
              'Other users can’t see your personal records. A group’s expenses are visible to that group’s members.',
              'Your amounts and what you spent them on are encrypted in the database. Dates, categories and names are not.',
              'This isn’t end-to-end encryption: the app’s server can still decrypt your data to show it to you.',
              'There are no ads and no analytics or tracking scripts, and we don’t sell your data.',
            ]} />
          </Section>

          <Section title="What we store">
            <Body>{STORED_INTRO}</Body>
            <Bullets items={STORED.map(({ lead, text }) => <><Lead>{lead}</Lead> {text}</>)} />
            <Body>{STORED_READABLE_NOTE}</Body>
            <Body>{ON_DEVICE.join(' ')}</Body>
          </Section>

          <Section title="What’s encrypted">
            <Body>{ENCRYPTED_INTRO}</Body>
            <Bullets items={ENCRYPTED} />
            <Body>{ENCRYPTED_PLAIN}</Body>
            <Body>{ENCRYPTED_LIMITS}</Body>
          </Section>

          <Section title="Who can see your data">
            <Bullets items={[
              <><Lead>Your personal records are yours.</Lead> Row-level security and access checks in the database stop other users from reading your expenses, income, budgets, accounts, goals and recurring payments.</>,
              <><Lead>Your group members.</Lead> Everyone in a group can see its expenses, splits, balances, settlements, comments and change log, plus each member’s name and profile picture. If you’ve added payment details, people in your groups can see them so they can pay you back.</>,
              <><Lead>Anyone with an invite link.</Lead> Someone who opens an invite link while signed out sees only the group’s name and picture, how many members it has, who invited them and when the link expires. Once signed in, they also see members’ names and pictures before choosing to join. They see no expenses or balances until they join. Links expire after 24 hours at most. Share them only with people you’d add to the group.</>,
              <><Lead>Anyone with a picture’s link.</Lead> Profile and group pictures are stored as public images, so anyone who has the link to one can open it.</>,
              <><Lead>Us.</Lead> As with any hosted service, the developer who runs Budgeer has administrative access to the database. We don’t look at your data unless you ask us to help with a problem.</>,
            ]} />
          </Section>

          <Section title="Services we use">
            <Body>These are the outside services involved, and what each one receives.</Body>
            <Bullets items={SERVICES.map(({ name, what }) => <><Lead>{name}.</Lead> {what}</>)} />
          </Section>

          <Section title="Your choices">
            <Bullets items={[
              <><Lead>Notifications.</Lead> You can turn push and email notifications off at any time in Settings → Notifications.</>,
              <><Lead>Payment details.</Lead> They’re optional, and you can clear them at any time in Settings → Account → Getting paid.</>,
              <><Lead>Deleting your account.</Lead> In Settings → Security → Delete account. This permanently deletes your account, your profile picture and your personal records: expenses, income, categories, accounts, budgets, goals, recurring payments, notifications and the comments you’ve written.</>,
              <><Lead>What stays after you delete.</Lead> Group history stays for the other members: the expenses, splits and settlements you were part of, and the change log, still shown under your name. Groups you own pass to another member; a group you own with no other members is deleted, along with its picture.</>,
            ]} />
          </Section>
        </Stack>
      </Container>
    </Box>
  )
}
