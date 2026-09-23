import LegalLayout, { Body, Bullets, MailLink, PageLink } from './LegalLayout.jsx'
import { PRIVACY_EMAIL, SUPPORT_EMAIL } from '../../shared/lib/contact.js'
import { DISCLAIMER } from '../../shared/lib/disclaimer.js'
import { CONTROLLER, LEGAL_VERSIONS, RETENTION } from './legal.js'

// Terms of Use. A material change needs a new LEGAL_VERSIONS.terms (and the
// SQL twin, current_legal_versions), which asks every user to accept it.

const SUPPORT = <MailLink to={SUPPORT_EMAIL} />
const PRIVACY = <MailLink to={PRIVACY_EMAIL} />

const SECTIONS = [
  { id: 'about', title: 'About these terms', body: (
    <Body>
      These terms are an agreement between you and <strong>{CONTROLLER}</strong> (“we”), which
      provides the Budgeer app and budgeer.com. By creating an account you accept them and
      confirm you have read the <PageLink to="/privacy">Privacy Notice</PageLink>. For questions
      about the service, contact {SUPPORT}; for anything about your personal data, {PRIVACY}.
    </Body>
  ) },
  { id: 'service', title: 'What Budgeer is — and isn’t', body: (
    <>
      <Body>
        <strong>Budgeer is a free hobby project, run by one person in their spare time.</strong> It
        helps you keep track of your own spending and income and split shared costs with friends,
        for personal, non-commercial use. It is not a business service: there is no subscription,
        no service-level promise and no guaranteed support.
      </Body>
      <Bullets items={[
        'Budgeer is not a bank, a payment service, an e-money or investment service, or a financial, tax or legal adviser. It never holds, moves or collects money, and it doesn’t connect to your bank accounts.',
        'It is provided free of charge, “as is” and “as available”. We don’t promise that it will always be available, work without interruption or errors, keep your data forever, or keep every feature.',
        'We don’t guarantee that anything it shows is accurate, complete or up to date — see “No financial advice” below.',
      ]} />
    </>
  ) },
  { id: 'advice', title: 'No financial advice', body: (
    <>
      <Body><strong>{DISCLAIMER}</strong></Body>
      <Bullets items={[
        'Budgeer only records and organises the data you enter. Nothing in it is financial, investment, tax or legal advice, or a recommendation to do anything with your money.',
        'Figures can be wrong. Calculations, totals and balances, exchange rates (the European Central Bank’s daily reference rates, or an estimate until they arrive), projections, budget alerts, yearly subscriptions spread over months, bank-statement imports and receipt scans may be inaccurate or incomplete.',
        'You are responsible for your own decisions and for checking figures. Always check important amounts against your bank statements before relying on them or paying anyone, and ask a qualified professional before making financial, tax or legal decisions.',
      ]} />
    </>
  ) },
  { id: 'account', title: 'Your account', body: (
    <Bullets items={[
      'You must be at least 16 years old and give a valid email address that you control.',
      'Keep your password secret and your devices secure; you’re responsible for what happens in your account. Tell us at once if you think someone else has accessed it.',
      'One account per person. Don’t create accounts for others or with someone else’s email address.',
    ]} />
  ) },
  { id: 'content', title: 'What you enter and your group arrangements', body: (
    <Bullets items={[
      'You are responsible for what you enter — amounts, descriptions, comments, names and pictures — and for checking it is correct. Your data stays yours; you give us only the permission needed to store, process and show it to run the service for you, and to show group data to the members of that group.',
      'Arrangements between you and your friends are yours. Budgeer doesn’t hold, move or collect money, and it isn’t a party to what you agree in a group. Balances are a record to help you settle up; check them together before paying.',
      'Revolut and PayPal buttons only open your own payment app or website with the details filled in; the payment is between you and that provider, under their terms.',
      'When you add friends to a group or invite them by email, you share their name or email address with us. Only do that for people who would expect it, and keep descriptions and comments about others fair and relevant.',
      'Don’t put special categories of data (such as health information) or anything unlawful in descriptions, notes, comments, names or pictures.',
    ]} />
  ) },
  { id: 'use', title: 'Acceptable use', body: (
    <>
      <Body>Don’t use Budgeer to:</Body>
      <Bullets items={[
        'break the law, or harass, deceive or harm anyone;',
        'send unwanted invites or messages, or get around rate limits;',
        'access data or accounts that aren’t yours, probe or break the service’s security, or overload it;',
        'copy, resell or build a competing service from Budgeer’s code or data by automated means.',
      ]} />
      <Body>If you find a security problem, please tell us at {SUPPORT} rather than exploiting it.</Body>
    </>
  ) },
  { id: 'liability', title: 'Limitation of liability', body: (
    <>
      <Body>
        Budgeer is free and provided as a hobby, so to the fullest extent Belgian law allows, we are
        not liable for any loss or damage arising from your use of Budgeer, from it being
        unavailable, or from relying on its figures — including financial losses, lost data or
        backups, missed or wrong payments, disagreements within a group, or decisions you make
        based on the app — nor for indirect or consequential loss.
      </Body>
      <Body>
        This never excludes or limits our liability for intent or fraud, for gross negligence, or
        for death or personal injury, or anything else the law doesn’t allow us to exclude, and it
        doesn’t affect any mandatory right you have as a consumer under Belgian or EU law.
      </Body>
    </>
  ) },
  { id: 'availability', title: 'Changes and shutting down', body: (
    <Bullets items={[
      'We may change, pause or remove features, or take Budgeer offline for maintenance, without notice when that’s needed to keep it working or secure.',
      'We may stop offering Budgeer altogether. If we do, we will tell you in advance where possible — at least 30 days before it shuts down — so you can download your data (Settings → Privacy) or a backup (Settings → Your data) first.',
    ]} />
  ) },
  { id: 'ending', title: 'Ending your use', body: (
    <Bullets items={[
      'You can stop at any time and delete your account in Settings → Security; the Privacy Notice explains what is deleted and what stays for your groups.',
      'We may suspend or close an account that seriously or repeatedly breaks these terms, after warning you where reasonable.',
      `Accounts nobody has used for ${RETENTION.inactiveDeleteMonths} months are deleted after an email warning, as the Privacy Notice explains.`,
    ]} />
  ) },
  { id: 'changes', title: 'Changes to these terms', body: (
    <Body>
      This is version {LEGAL_VERSIONS.terms}. If we change these terms, we publish a new version
      with a new date and ask you to accept it the next time you open the app. If you don’t
      agree, you can download your data and delete your account instead.
    </Body>
  ) },
  { id: 'law', title: 'Law and disputes', body: (
    <Body>
      These terms are governed by Belgian law, and the courts of Belgium have jurisdiction —
      without depriving you of the protection of the mandatory consumer rules and courts of the
      country where you live. Please contact us first at {SUPPORT}; most issues can be solved
      quickly.
    </Body>
  ) },
]

export default function Terms() {
  return (
    <LegalLayout
      eyebrow="Terms of Use"
      title="The terms for using Budgeer"
      intro="The rules for using Budgeer, in plain language: what the service is — and isn’t — what we expect from you, and what you can expect from us."
      version={LEGAL_VERSIONS.terms}
      sections={SECTIONS}
    />
  )
}
