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
  { id: 'service', title: 'What Budgeer is', body: (
    <>
      <Body><strong>{DISCLAIMER}</strong></Body>
      <Bullets items={[
        'Budgeer is a free hobby project run by one person. It helps you keep track of your own spending and income and split shared costs with friends, for personal, non-commercial use.',
        'It is provided “as is” and “as available”, without any promise that it will always work, be error-free, or keep every feature.',
        'We may change Budgeer or stop offering it. Where possible we will give reasonable notice first — at least 30 days before shutting it down — so you can download your data (Settings → Privacy).',
      ]} />
    </>
  ) },
  { id: 'advice', title: 'No financial advice', body: (
    <Bullets items={[
      'Budgeer only records and organises the data you enter. Nothing in it is financial, investment, tax or legal advice, or a recommendation to do anything with your money.',
      'Figures can be wrong. Calculations, totals and balances, exchange rates (the European Central Bank’s daily reference rates, or an estimate until they arrive), projections, budget alerts, yearly subscriptions spread over months, bank-statement imports and receipt scans may be inaccurate or incomplete.',
      'Always check important figures against your bank statements, and ask a qualified professional before making financial, tax or legal decisions.',
    ]} />
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
        To the extent Belgian law allows, and because Budgeer is a free hobby project, we are not
        liable for any loss or damage arising from your use of Budgeer or from relying on its
        figures — including financial losses, lost data, missed payments, disagreements within a
        group, or decisions you make based on the app — nor for indirect or consequential loss.
      </Body>
      <Body>
        This never excludes or limits our liability for intent or fraud, for gross negligence, or
        for death or personal injury, and it doesn’t affect any mandatory right you have as a
        consumer under Belgian or EU law.
      </Body>
    </>
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
      intro={`The rules for using Budgeer, in plain language: what the service is, what we expect from you, and what you can expect from us. ${DISCLAIMER}`}
      version={LEGAL_VERSIONS.terms}
      sections={SECTIONS}
    />
  )
}
