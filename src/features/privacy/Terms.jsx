import { Trans } from '../../shared/lib/i18n/I18nProvider.jsx'
import LegalLayout, { Body, Bullets, MailLink, PageLink } from './LegalLayout.jsx'
import { PRIVACY_EMAIL, SUPPORT_EMAIL } from '../../shared/lib/contact.js'
import { CONTROLLER, LEGAL_VERSIONS, RETENTION } from './legal.js'
import { useLegalText } from './useLegalText.js'

// Terms of Use. A material change needs a new LEGAL_VERSIONS.terms (and the
// SQL twin, current_legal_versions), which asks every user to accept it.
//
// The words are in src/locales/<lang>/privacy.js under `terms`, one key per
// paragraph or bullet; this file holds their order. English is the
// authoritative text and the Greek a translation of it: change both in the
// same commit, key by key (en/privacy.js's header has the details).

export default function Terms() {
  const doc = useLegalText()
  const { t } = doc
  const components = {
    strong: <strong />,
    support: <MailLink to={SUPPORT_EMAIL} />,
    privacyEmail: <MailLink to={PRIVACY_EMAIL} />,
    privacy: <PageLink to={doc.href('/privacy')} />,
  }
  // One paragraph or bullet of the terms.
  const text = (key, values) => <Trans t={t} k={`terms.${key}`} values={values} components={components} />
  const bullets = (id, keys) => <Bullets items={keys.map((k) => text(`${id}.${k}`))} />

  const sections = [
    { id: 'about', body: <Body>{text('about.body', { controller: CONTROLLER })}</Body> },
    { id: 'service', body: (
      <>
        <Body>{text('service.body')}</Body>
        {bullets('service', ['notFinancial', 'asIs', 'accuracy'])}
      </>
    ) },
    { id: 'advice', body: (
      <>
        {/* The disclaimer in the document's language (the English original shows it in English). */}
        <Body><strong>{t('common:hobby.disclaimer')}</strong></Body>
        {bullets('advice', ['recordsOnly', 'figures', 'estimates', 'imports', 'responsibility'])}
      </>
    ) },
    { id: 'account', body: bullets('account', ['age', 'secure', 'onePerPerson']) },
    { id: 'content', body: bullets('content', ['yours', 'arrangements', 'payments', 'others', 'special']) },
    { id: 'use', body: (
      <>
        <Body>{text('use.intro')}</Body>
        {bullets('use', ['law', 'spam', 'access', 'copy'])}
        <Body>{text('use.report')}</Body>
      </>
    ) },
    { id: 'liability', body: (
      <>
        <Body>{text('liability.limit')}</Body>
        <Body>{text('liability.exceptions')}</Body>
      </>
    ) },
    { id: 'availability', body: bullets('availability', ['changes', 'shutdown']) },
    { id: 'ending', body: (
      <Bullets items={[
        text('ending.you'),
        text('ending.us'),
        text('ending.inactive', { months: RETENTION.inactiveDeleteMonths }),
      ]} />
    ) },
    { id: 'changes', body: <Body>{text('changes.body', { version: LEGAL_VERSIONS.terms })}</Body> },
    { id: 'law', body: <Body>{text('law.body')}</Body> },
  ].map((s) => ({ ...s, title: t(`terms.${s.id}.title`) }))

  return (
    <LegalLayout
      doc={doc}
      eyebrow={t('terms.eyebrow')}
      title={t('terms.title')}
      intro={t('terms.intro')}
      version={LEGAL_VERSIONS.terms}
      sections={sections}
    />
  )
}
