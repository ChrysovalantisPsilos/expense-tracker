// The legal documents' versions, what changed in each, and the names of the
// consent purposes — shared by the app (re-exported from
// src/features/privacy/legal.js) and the edge functions' emails
// (_shared/gdprEmails.ts, privacy-emails). No imports: the unit tests load it.
//
// LOCKSTEP: LEGAL_VERSIONS ≡ public.current_legal_versions() (the newest
// migration defining it; test/legal.test.js checks they match). Bump both when
// the Privacy Notice or Terms change, and add a LEGAL_CHANGES entry: signed-in
// users are asked to accept the new version (LegalGate), and everyone who
// signed up before it is emailed once about it (privacy-emails, legal sweep).

export const LEGAL_VERSIONS = { privacy: '2026-09-23', terms: '2026-09-23' }

// What changed in each version, newest first. `items` are listed in the
// in-app update prompt (every entry newer than what the user last accepted);
// `summary` is the one-paragraph version the update email quotes.
export const LEGAL_CHANGES = [
  {
    version: '2026-09-23',
    summary: 'A full Privacy Notice that explains who is responsible for your data, why we use it, who processes it, how long we keep it and how to use your rights; new Terms of Use that make clear Budgeer is a free hobby project, not a financial service; the weekly summary is now optional; and accounts unused for two years are deleted after an email warning.',
    items: [
      'A full Privacy Notice: who is responsible for your data, why we use it and on what legal basis, who processes it and where, and how long we keep it.',
      'New Terms of Use for the app: Budgeer is a free hobby project provided as is, not a bank or financial service, and does not give financial advice.',
      'Your rights, with a way to exercise each one in Settings → Privacy.',
      'Automatic clean-up: notifications after 90 days, group change logs after 2 years, and accounts unused for 2 years (after an email warning).',
      'The weekly summary is now optional and off for new accounts.',
    ],
  },
]

// The change entry of the newest version in force (both documents share one
// timeline), or null if it has none.
export function currentLegalChange(): { version: string; summary: string; items: string[] } | null {
  const v = [LEGAL_VERSIONS.privacy, LEGAL_VERSIONS.terms].sort()[1]
  return LEGAL_CHANGES.find((c) => c.version === v) ?? null
}

// public.consents.purpose → what the user calls it.
export const CONSENT_LABELS: Record<string, string> = {
  privacy_notice: 'Privacy Notice',
  terms: 'Terms of Use',
  weekly_digest: 'Weekly summary',
  email_notifications: 'Email notifications',
  push_notifications: 'Push notifications',
}
