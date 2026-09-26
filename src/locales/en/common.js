// Namespace `common`: words and phrases shared across features, and the
// shared UI (src/shared/ui). Conventions: docs/I18N.md.
export default {
  actions: {
    logIn: 'Log in',
    signUp: 'Sign up',
  },
  errors: {
    notSaved: 'Couldn’t save',
  },
  a11y: {
    skipToContent: 'Skip to content',
    brandHome: 'Budgeer home',
  },
  offline: 'Offline',
  theme: {
    toLight: 'Switch to light theme',
    toDark: 'Switch to dark theme',
  },
  language: {
    // The public header's EN/ΕΛ switch (its options are the languages' own names).
    choose: 'Language',
  },
  site: {
    open: 'Open {{site}}',
    live: 'live site',
    test: 'test site',
    testTag: 'Test site: separate from budgeer.com',
  },
  hobby: {
    disclaimer: 'Budgeer is a hobby project and does not provide financial advice.',
    badge: 'Free · hobby project · no ads',
    title: 'A free hobby project',
    notice: 'Budgeer is a free hobby project run by one person in their spare time. It isn’t a bank, a financial service or an adviser, and it doesn’t give financial, tax or legal advice. It’s provided as is, without guarantees; always check important figures against your bank.',
  },
}
