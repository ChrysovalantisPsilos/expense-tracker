import LegalLayout, { Body, Bullets, Facts, Lead, MailLink, PageLink } from './LegalLayout.jsx'
import { PRIVACY_EMAIL } from '../../shared/lib/contact.js'
import { CONTROLLER, LEGAL_VERSIONS, RETENTION as R } from './legal.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { EXPIRATION_DB, REST_CACHE, RPC_CACHE } from '../../shared/lib/userDataCaches.js'

// The Privacy Notice (GDPR Art. 13/14). Every statement must stay true to the
// code and migrations — update it alongside any change to what is stored,
// encrypted, shared or sent, the services used, retention (0073) or account
// deletion (0072, _shared/accountDeletion.ts). A material change needs a new
// LEGAL_VERSIONS entry (and the SQL twin), which asks users to accept it.
// docs/GDPR.md is the matching record of processing.

const EMAIL = <MailLink to={PRIVACY_EMAIL} />

// ===========================================================================
// EDIT HERE: what we hold, why, and on what legal basis.
// ===========================================================================

const DATA = [
  <><Lead>Account:</Lead> your email address; your password, which Supabase Auth stores only as a salted hash; how you sign in (password, Google, passkeys — for a passkey, its name, public key and when it was last used); when the account was created and last signed in.</>,
  <><Lead>Profile:</Lead> your name, profile picture, main currency and app settings (notification switches, yearly-subscription display, whether you finished the setup and tour).</>,
  <><Lead>Your money records:</Lead> expenses and income (amount, currency, exchange rate, description, notes, date, category, account), categories and auto-categorising rules, accounts and balances, budgets, savings goals and recurring payments.</>,
  <><Lead>Payment details you add for settling up</Lead> (optional): IBAN, Revolut tag, PayPal.me name.</>,
  <><Lead>Groups:</Lead> group name and picture; members’ names and roles; shared expenses, who paid and how they’re split; settlements; comments; a change log of who did what.</>,
  <><Lead>Other people’s data you give us:</Lead> names of friends you add to a group, and email addresses you invite. Please add only people who expect it.</>,
  <><Lead>Notifications:</Lead> the notifications sent to you and, if you turn on push, a delivery address and keys for each device.</>,
  <><Lead>Consent and preference history:</Lead> which Privacy Notice and Terms versions you accepted and when, and when you switched optional messages on or off.</>,
  <><Lead>Technical data:</Lead> Supabase Auth keeps each signed-in session’s IP address and browser description; our hosting providers keep short-lived request logs (IP address, time, page requested) to run and protect the service. We use no analytics or tracking tools.</>,
]

const PURPOSES = [
  { name: 'Running your account and the app', lines: [
    ['What', 'Sign-in, storing and showing your records, budgets, insights, statements, backups and currency conversion.'],
    ['Legal basis', 'Contract — needed to provide the service you signed up for (Art. 6(1)(b) GDPR).'],
  ] },
  { name: 'Groups and bill splitting', lines: [
    ['What', 'Showing a group’s members, expenses, balances, comments and change log to its members; sending invites you ask us to send.'],
    ['Legal basis', 'Contract with you; for friends you add or invite, our and our users’ legitimate interest in splitting shared costs (Art. 6(1)(f)).'],
  ] },
  { name: 'Service messages', lines: [
    ['What', 'In-app notifications, and — if you turn them on — push notifications and emails about group invites and members joining or leaving, payment reminders and budget alerts.'],
    ['Legal basis', 'Contract. Push also needs your device’s permission; both switch off in Settings → Notifications.'],
  ] },
  { name: 'Emails about your account and your data', lines: [
    ['What', 'Sent whatever your notification settings, and never with amounts or other records: a notice when this Privacy Notice or the Terms change; a confirmation when your account is deleted (by you, or after 2 years without use, following the warning); a security notice when a copy of your data is downloaded (at most one an hour) or your notification choices change (one summary per 15 minutes); and a receipt for a request sent with the privacy request form.'],
    ['Legal basis', 'Legal obligation to inform you about your data and your requests (Art. 6(1)(c), with Art. 12, 13 and 19 GDPR), and our legitimate interest in keeping your account secure (Art. 6(1)(f)).'],
  ] },
  { name: 'Weekly summary', lines: [
    ['What', 'A weekly notification with how many expenses you logged and your top category.'],
    ['Legal basis', 'Consent (Art. 6(1)(a)). Off for new accounts; turn it on or off at any time in Settings → Notifications. Accounts created before 23 September 2026 keep their earlier setting and can switch it off the same way.'],
  ] },
  { name: 'Security and abuse prevention', lines: [
    ['What', 'Rate limits, sign-in sessions, password re-checks before account deletion, request logs.'],
    ['Legal basis', 'Legitimate interest in keeping accounts and the service safe (Art. 6(1)(f)).'],
  ] },
  { name: 'Legal obligations', lines: [
    ['What', 'Keeping a record of your consents, answering your privacy requests, handling security incidents, removing inactive accounts.'],
    ['Legal basis', 'Legal obligation (Art. 6(1)(c), with Art. 5(1)(e), 7(1) and 12–22 GDPR).'],
  ] },
]

const RECIPIENTS = [
  { name: 'Supabase (Supabase, Inc.)', lines: [
    ['Role', 'Processor: database, sign-in, file storage (profile and group pictures) and server functions. It stores everything listed above.'],
    ['Where', 'Our database is hosted in the EU: AWS region eu-west-3 (Paris, France). Supabase is a US company; its staff or sub-processors may access data from outside the EU for support and operations.'],
    ['Safeguard', 'Supabase’s Data Processing Addendum with the EU Standard Contractual Clauses.'],
  ] },
  { name: 'Vercel (Vercel Inc.)', lines: [
    ['Role', 'Processor: hosts the website and the app’s files. The data you enter doesn’t pass through it, but it sees your IP address and the pages you load.'],
    ['Where', 'A worldwide network, including the United States.'],
    ['Safeguard', 'Vercel’s Data Processing Addendum with the EU Standard Contractual Clauses (and the EU–US Data Privacy Framework where Vercel is certified).'],
  ] },
  { name: 'Resend (Plus Five Five, Inc.)', lines: [
    ['Role', 'Processor: delivers our emails. It receives the recipient’s address and the email: invites (your name and the group’s name), group event emails if you turned them on, the emails about your account and your data described above (inactivity warnings, deletion confirmations, security and update notices, privacy request receipts), privacy requests you send through the form (with what you wrote), and the replies we send you from privacy@ or support@. Our emails never contain your amounts or expense descriptions, and we don’t use open or click tracking.'],
    ['Where', 'Sent from the EU region eu-west-1 (Ireland); Resend is a US company.'],
    ['Safeguard', 'Resend’s Data Processing Addendum with the EU Standard Contractual Clauses.'],
  ] },
  { name: 'Cloudflare (Cloudflare, Inc.)', lines: [
    ['Role', 'Processor: manages the budgeer.com domain, protects and speeds up the website (so it sees your IP address and the pages you load), and receives emails sent to privacy@budgeer.com and support@budgeer.com and passes them on to our mailbox without keeping them.'],
    ['Where', 'A worldwide network, including the United States; Cloudflare is a US company.'],
    ['Safeguard', 'Cloudflare’s Data Processing Addendum with the EU Standard Contractual Clauses (and the EU–US Data Privacy Framework).'],
  ] },
  { name: 'Google (Gmail)', lines: [
    ['Role', 'Our privacy and support mailbox is a Gmail account. If you email privacy@ or support@, or use the privacy request form, your message and email address are stored there so we can answer; our replies are sent through Resend. We delete this correspondence when it’s no longer needed, and at the latest two years after the request is closed.'],
    ['Where', 'Google’s data centres worldwide; Google is a US company.'],
    ['Safeguard', 'The EU–US Data Privacy Framework (Google is certified) and Google’s terms.'],
  ] },
  { name: 'Google', lines: [
    ['Role', 'Independent controller — only if you use “Sign in with Google”. Google confirms who you are and shares your name, email address and profile picture with us. Your Google profile picture is loaded from Google’s servers, so Google sees your IP address when it’s shown.'],
    ['Where', 'Google’s own terms and privacy policy apply.'],
  ] },
  { name: 'Your browser’s push service', lines: [
    ['Role', 'Only if you turn on push: the push service of your browser’s maker (for example Google, Apple, Mozilla or Microsoft) delivers the notification. The message is encrypted so only your device can read it; the service sees the delivery address and timing.'],
  ] },
  { name: 'Frankfurter (frankfurter.dev)', lines: [
    ['Role', 'A free, independent service that republishes the European Central Bank’s daily exchange rates. When you enter an amount in another currency, your browser asks it for that day’s rate: it receives the currency codes and the date — never the amount or who you are — and, like any website, your IP address. Our server also fetches the daily rates from it, without any personal data.'],
  ] },
  { name: 'Revolut and PayPal', lines: [
    ['Role', 'Only if you tap a Revolut or PayPal button when settling up: the link opens their site or app with your friend’s Revolut tag or PayPal.me name and the amount. Nothing is sent until you tap.'],
  ] },
  { name: 'Other Budgeer users', lines: [
    ['Role', 'Members of your groups see your name, profile picture, the group’s expenses, splits, balances, settlements, comments and change log, and your payment details if you added them. Someone with a group invite link sees the group’s name and picture, how many members it has, who invited them, and (once signed in) members’ names and pictures.'],
  ] },
]

const RETENTION_ITEMS = [
  <><Lead>Your account and records:</Lead> until you delete them or your account.</>,
  <><Lead>Notifications:</Lead> deleted automatically after {R.notificationsDays} days.</>,
  <><Lead>Group change log:</Lead> entries deleted automatically after {R.groupLogYears} years.</>,
  <><Lead>Invites:</Lead> links expire after 24 hours at most and are deleted a week after they expire.</>,
  <><Lead>Rate-limit counters and sign-in audit records:</Lead> deleted after {R.rateLimitDays} days at most.</>,
  <><Lead>Emails to privacy@ and support@:</Lead> kept in our mailbox only as long as needed to answer and follow up, and deleted at the latest two years after your request is closed.</>,
  <><Lead>Inactive accounts:</Lead> if nobody has signed in to or used an account for {R.inactiveWarnMonths} months, we email a warning; at {R.inactiveDeleteMonths} months — and never sooner than {R.inactiveNoticeDays} days after the warning — the account is deleted exactly as described under “Erasure”. Signing in stops it.</>,
  <><Lead>Consent history:</Lead> kept while your account exists, to show what you agreed to.</>,
  <><Lead>Backups:</Lead> our database host keeps encrypted backups for a limited period, so deleted data disappears from them when they roll over.</>,
]

// Every key in STORAGE_KEYS (and each service-worker cache) is named here;
// test/storageKeys.test.js fails if one is missing.
const DEVICE = [
  <><Lead>Sign-in session</Lead> (Supabase’s <code>sb-…-auth-token</code>): keeps you signed in on this device; removed when you sign out.</>,
  <><Lead>Offline copy</Lead> (service worker caches <code>{REST_CACHE}</code> and <code>{RPC_CACHE}</code>, with their timestamps in <code>{EXPIRATION_DB}</code>): recently loaded data so the app opens offline; each item expires after a day, and all of it is cleared when you sign out.</>,
  <><Lead>App files</Lead> (service worker cache): the app’s own code, styles, fonts and icons, so it starts quickly and works offline. None of your data; replaced when the app updates.</>,
  <><Lead>Your choices:</Lead> light/dark appearance (<code>{STORAGE_KEYS.appearance}</code>), the dashboard chart/table view (<code>{STORAGE_KEYS.overviewView}</code>), that you’ve answered the notification prompt (<code>{STORAGE_KEYS.notifPrompted}</code>), and that you tapped “Not now” when Settle up suggested adding your payment details (<code>{STORAGE_KEYS.paymentAskDismissed}</code>), so we don’t ask again on this device.</>,
  <><Lead>Import column choices</Lead> (<code>{STORAGE_KEYS.importMappings}</code>): how you matched the columns of your last few imported spreadsheet layouts, so the next file from the same bank skips that step. Only column headings and your choices — no transactions.</>,
  <><Lead>Exchange rates</Lead> (<code>{STORAGE_KEYS.fxRatePrefix}…</code>): rates already looked up, so they aren’t fetched again. Only currency codes, dates and rates.</>,
  <><Lead>Sign-in helpers:</Lead> a pending group invite while you sign up (<code>{STORAGE_KEYS.pendingInvite}</code>, removed once you join) and the page to return to after signing in through Google or an email link (<code>{STORAGE_KEYS.returnPath}</code>, removed once used and ignored after an hour).</>,
  <><Lead>This tab only</Lead> (session storage, gone when you close the tab): the email address you’re confirming after signing up (<code>{STORAGE_KEYS.pendingEmail}</code>), that you’ve seen the passkey prompt (<code>{STORAGE_KEYS.passkeyPrompted}</code>), and that you’re connecting Google in Settings (<code>{STORAGE_KEYS.linkingGoogle}</code>).</>,
]

// ===========================================================================

function Rights() {
  return (
    <>
      <Body>
        You can exercise any of these rights in the app or by emailing {EMAIL}. It’s free. We
        answer within <Lead>one month</Lead> of receiving your request; for complex or many
        requests we may extend this by up to two further months, and we’ll tell you why within
        the first month (Art. 12(3) GDPR). We reply to the email address on your account, and may
        ask you to confirm a request comes from you.
      </Body>
      <Facts items={[
        { name: 'Access (Art. 15)', lines: [
          ['In the app', 'Settings → Privacy → Download my data: every piece of personal data we hold about you, as a JSON file.'],
          ['By email', 'Ask for a copy, or for details about how we use your data.'],
        ] },
        { name: 'Rectification (Art. 16)', lines: [
          ['In the app', 'Edit your name, picture and payment details (and your main currency, until you add entries) in Settings → Account, and edit or delete any expense, income, budget, goal or recurring payment where it’s shown.'],
          ['By email', 'For anything you can’t change yourself, such as your email address.'],
        ] },
        { name: 'Erasure (Art. 17)', lines: [
          ['In the app', 'Settings → Security → Delete account. This permanently deletes your account, sign-in details and passkeys, profile and picture, payment details, expenses and income, categories and rules, accounts, budgets, goals, recurring payments, notifications (yours, and the ones other members received about something you did), push subscriptions, consent history, and the group comments you wrote. Groups you own pass to another member; a group with no other members is deleted with its picture.'],
          ['What stays', 'Group expenses, splits and settlements you were part of stay for the other members, because their balances depend on them — but your name there is replaced by “Former member” with no link to you, as it is in the group change log and its texts. The notifications other members received about something you did are deleted. A name you used before renaming yourself may still appear in older change-log texts until they are deleted after the periods above.'],
          ['By email', 'Or ask us to delete specific data.'],
        ] },
        { name: 'Restriction (Art. 18)', lines: [
          ['How', 'Use the request form in Settings → Privacy, or email us, to ask us to limit how we use your data while, for example, its accuracy is checked.'],
        ] },
        { name: 'Data portability (Art. 20)', lines: [
          ['In the app', 'Settings → Privacy → Download my data (machine-readable JSON). Settings → Your data also makes a backup you can restore into Budgeer.'],
        ] },
        { name: 'Objection (Art. 21)', lines: [
          ['How', 'Where we rely on legitimate interest (group sharing of data about friends you add, security measures), you can object on grounds relating to your situation — use the request form or email us. We don’t do direct marketing.'],
        ] },
        { name: 'Withdrawing consent (Art. 7(3))', lines: [
          ['In the app', 'Switch the weekly summary (and push or email notifications) off in Settings → Notifications. Withdrawing doesn’t affect what we did before. Settings → Privacy shows your consent history.'],
        ] },
        { name: 'Automated decisions (Art. 22)', lines: [
          ['Our practice', 'We make no decisions about you based solely on automated processing that have legal or similarly significant effects. Auto-categorising only suggests categories for your own records. The one automatic action on accounts is the inactivity clean-up above, which is announced by email first and stopped by signing in.'],
        ] },
        { name: 'Complaint to a supervisory authority (Art. 77)', lines: [
          ['Where', 'Belgian Data Protection Authority — Autorité de protection des données / Gegevensbeschermingsautoriteit (APD/GBA), Rue de la Presse 35 / Drukpersstraat 35, 1000 Brussels, Belgium · contact@apd-gba.be · +32 2 274 48 00 · www.dataprotectionauthority.be'],
          ['Also', 'You may complain to the data protection authority of the EU country where you live or work, or where you think the problem happened. We’d appreciate the chance to sort it out with you first.'],
        ] },
      ]} />
    </>
  )
}

const SECTIONS = [
  { id: 'who', title: 'Who is responsible', body: (
    <Body>
      The controller of your personal data is <Lead>{CONTROLLER}</Lead>, which runs the Budgeer
      app and budgeer.com. For anything about your data, contact {EMAIL}. We haven’t appointed a
      Data Protection Officer, as the law doesn’t require one for a service of our size; the
      address above reaches the person responsible. We apply the GDPR and the Belgian Act of
      30 July 2018 on the protection of natural persons with regard to the processing of
      personal data.
    </Body>
  ) },
  { id: 'short', title: 'The short version', body: (
    <Bullets items={[
      'Other users can’t see your personal records. A group’s expenses are visible to that group’s members.',
      'Your amounts and what you spent them on are encrypted in the database. Dates, categories and names are not.',
      'There are no ads, no analytics or tracking scripts, no cookies, and we don’t sell your data.',
      'You can download everything we hold about you, or delete your account, from Settings at any time.',
    ]} />
  ) },
  { id: 'data', title: 'What we collect', body: (
    <>
      <Body>We collect what you give us when you use Budgeer, and a little technical data:</Body>
      <Bullets items={DATA} />
      <Body>
        Some work happens only on your device: receipt scans are read in your browser (the photo
        isn’t uploaded or kept), and imported spreadsheets are read in your browser — only the
        transactions you import are saved. We don’t ask for special categories of data (such as
        health or religion); please don’t put them in descriptions or notes.
      </Body>
    </>
  ) },
  { id: 'purposes', title: 'Why we use it, and our legal basis', body: <Facts items={PURPOSES} /> },
  { id: 'recipients', title: 'Who receives it', body: (
    <>
      <Body>
        We share data only with the services below, each for the purpose described, and with
        authorities when the law requires it. Our processors act only on our instructions under a
        data processing agreement.
      </Body>
      <Facts items={RECIPIENTS} />
    </>
  ) },
  { id: 'transfers', title: 'Transfers outside the EU', body: (
    <Body>
      Our database is stored in the EU. Where a provider above can access data from outside the
      European Economic Area (Supabase, Vercel, Resend, Cloudflare and Google are US companies), the transfer is
      covered by the European Commission’s Standard Contractual Clauses in that provider’s data
      processing agreement, and — for providers certified under it — by the EU–US Data Privacy
      Framework adequacy decision. Email us for a copy of the relevant safeguards.
    </Body>
  ) },
  { id: 'retention', title: 'How long we keep it', body: <Bullets items={RETENTION_ITEMS} /> },
  { id: 'rights', title: 'Your rights and how to use them', body: <Rights /> },
  { id: 'security', title: 'How we protect it', body: (
    <Bullets items={[
      'Everything travels over encrypted (HTTPS) connections.',
      'Amounts, descriptions, notes, comments, balances, budgets, goals, the group change log and your payment details are encrypted in the database with a key kept separately in Supabase Vault. This isn’t end-to-end encryption: the server decrypts them to show them to you and your groups.',
      'Row-level security in the database stops other users from reading your records.',
      'Passwords are hashed by Supabase Auth; passkeys are supported; deleting an account asks for your password again (or a typed confirmation if you sign in with Google).',
      'Rate limits protect invites, emails, reports, comments and data exports from abuse.',
      <>If a personal data breach happens, we notify the Belgian Data Protection Authority within 72 hours where required, and tell you without undue delay if it is likely to put your rights at high risk.</>,
    ]} />
  ) },
  { id: 'device', title: 'Storage on your device (no cookies)', body: (
    <>
      <Body>
        Budgeer sets no cookies and uses no tracking. It keeps a few items in your browser’s
        storage that are strictly necessary for the service you asked for, or that remember your
        own choices — so no consent banner is needed:
      </Body>
      <Bullets items={DEVICE} />
      <Body>
        All of it stays on your device and is never sent to us. Signing out removes the session and
        the offline copy, and closing the tab removes the tab-only items. You can clear the rest at
        any time by deleting this site’s data in your browser’s settings.
      </Body>
    </>
  ) },
  { id: 'children', title: 'Children', body: (
    <Body>
      Budgeer is not intended for anyone under 16, and you must be 16 or older to create an
      account. We don’t knowingly collect data about children; if you believe a child has an
      account, email {EMAIL} and we will delete it.
    </Body>
  ) },
  { id: 'changes', title: 'Changes to this notice', body: (
    <Body>
      This is version {LEGAL_VERSIONS.privacy}. When we change this notice in a way that matters,
      we publish a new version with a new date and ask you to review and accept it the next time
      you open the app; earlier versions are available on request. See also the{' '}
      <PageLink to="/terms">Terms of Use</PageLink>.
    </Body>
  ) },
]

export default function Privacy() {
  return (
    <LegalLayout
      eyebrow="Privacy Notice"
      title="How Budgeer handles your personal data"
      intro="Budgeer is a free expense tracker and bill splitter. This notice explains what personal data we collect, why, who receives it, how long we keep it, and how to use your rights."
      version={LEGAL_VERSIONS.privacy}
      sections={SECTIONS}
    />
  )
}
