// Namespace `privacy`: src/features/privacy — the Privacy Notice (`notice`),
// the Terms of Use (`terms`), the frame they share (`layout`), the legal
// prompt (`gate`), Settings › Privacy (`settings`), the privacy request form
// (`request`), the consent history (`consent`) and the legal check's error
// screen (`checkError`).
//
// The legal documents: the English here is the authoritative text; el/privacy.js
// is a translation for convenience, and says the English prevails. Each key is
// one paragraph, bullet or fact, and has the same key in the Greek file, so a
// change here shows exactly which Greek paragraph to update (the i18n test
// fails until both have the same keys, {{values}} and <tags>). Changing what a
// document says is a material change: bump LEGAL_VERSIONS (legal.js) as
// usual. Translating it is not. Tags: <lead> bold lead-in, <strong> bold,
// <email/> <support/> <privacyEmail/> mail links, <terms> <privacy> links to
// the other document, <code> a literal name, and a self-closing tag named
// after a STORAGE_KEYS entry or cache (<appearance/>, <restCache/>, …) shows
// that key's name, so the names themselves never live in the dictionaries.
export default {
  layout: {
    version: 'Version <time>{{version}}</time> · effective {{date}}',
    help: 'Questions about using the app? See <link>Help & FAQ</link>.',
    contents: 'Contents',
    // Shown above a translated document only (never on the English one).
    translated: 'This is a translation provided for convenience. If this version and the English version differ, the English version prevails. <link>Read the English version</link>.',
    // Shown above the English original when the app is in another language.
    original: 'You’re reading the English original, which prevails. <link>Back to the translation</link>.',
  },
  notice: {
    eyebrow: 'Privacy Notice',
    title: 'How Budgeer handles your personal data',
    intro: 'Budgeer is a free expense tracker and bill splitter. This notice explains what personal data we collect, why, who receives it, how long we keep it, and how to use your rights.',
    // The "Label:" of each line in the boxed facts.
    labels: {
      what: 'What',
      basis: 'Legal basis',
      role: 'Role',
      where: 'Where',
      safeguard: 'Safeguard',
      inApp: 'In the app',
      byEmail: 'By email',
      whatStays: 'What stays',
      how: 'How',
      practice: 'Our practice',
      also: 'Also',
    },
    who: {
      title: 'Who is responsible',
      body: 'The controller of your personal data is <lead>{{controller}}</lead>, which runs the Budgeer app and budgeer.com. For anything about your data, contact <email/>. We haven’t appointed a Data Protection Officer, as the law doesn’t require one for a service of our size; the address above reaches the person responsible. We apply the GDPR and the Belgian Act of 30 July 2018 on the protection of natural persons with regard to the processing of personal data.',
    },
    short: {
      title: 'The short version',
      private: 'Other users can’t see your personal records. A group’s expenses are visible to that group’s members.',
      encrypted: 'Your amounts and what you spent them on are encrypted in the database. Dates, categories, savings choices, names and settings are not.',
      noAds: 'There are no ads, no analytics or tracking scripts, no cookies, and we don’t sell your data.',
      control: 'You can download everything we hold about you, or delete your account, from Settings at any time.',
    },
    data: {
      title: 'What we collect',
      intro: 'We collect what you give us when you use Budgeer, and a little technical data:',
      account: '<lead>Account:</lead> your email address; your password, which Supabase Auth stores only as a salted hash; how you sign in (password, Google, Apple, passkeys — for a passkey, its name, public key and when it was last used); when the account was created and last signed in.',
      profile: '<lead>Profile:</lead> your name, profile picture, main currency and app settings (language, notification switches, which AI helpers you turned on, yearly-subscription display, whether you finished the setup and tour, which “What’s new” update you’ve seen — kept with your account so it’s shown once on all your devices — and, if you turn it on, which income category is your salary and from which day of the month it counts toward the next month).',
      money: '<lead>Your money records:</lead> expenses and income (amount, currency, exchange rate, description, notes, date, category, account, and — for savings — whether the money came out of your income, or an expense was paid from savings or with meal vouchers), categories (the defaults every account gets, such as Salary, Bonus, Friends & family and Savings, and your own; and which income categories count as savings), auto-categorising rules (“description contains … → category”, including the ones you save while importing), accounts and balances, budgets, savings goals and recurring payments (with the same savings choices), your meal voucher setup (the amount per working day, whose working days, the top-up day and what was on the card when you last saved it), your salary notes (which salary payments you marked as holiday pay, a 13th month, a bonus or regular pay, your bonus category and the country whose prices you compare against), your Plan mode plan (the changes you’re trying to your recurring payments, any new ones you add to it, and the ideas you dismissed; after you apply it, for 24 hours, what your payments were before, so you can undo), and — if you turn on “Month in plain words” — the short summaries of your months written for you, each with a fingerprint of the totals it was written from.',
      payment: '<lead>Payment details you add for settling up</lead> (optional): IBAN, Revolut tag, PayPal.me name.',
      groups: '<lead>Groups:</lead> group name and picture; members’ names and roles; shared expenses, who paid and how they’re split; settlements; comments; a change log of who did what.',
      others: '<lead>Other people’s data you give us:</lead> names of friends you add to a group, and email addresses you invite. Please add only people who expect it. When you import a bank statement, the names of the people and businesses on it (who you paid, or who paid you) become part of the imported descriptions, and of any rule you save from them.',
      notifications: '<lead>Notifications:</lead> the notifications sent to you and, if you turn on push, a delivery address and keys for each browser, or for each iPhone with the Budgeer app a device token (and whether it’s a test or App Store build) and when it was last seen.',
      consents: '<lead>Consent and preference history:</lead> which Privacy Notice and Terms versions you accepted and when, and when you switched optional messages or AI helpers on or off.',
      technical: '<lead>Technical data:</lead> Supabase Auth keeps each signed-in session’s IP address and browser description; our hosting providers keep short-lived request logs (IP address, time, page requested) to run and protect the service. We use no analytics or tracking tools.',
      onDevice: 'Some work happens only on your device: receipt scans are read in your browser (the photo isn’t uploaded or kept), and bank statements you import (CSV or Excel files) are read in your browser, in a background task — the file itself is never uploaded. Only the transactions you import are saved: lines that aren’t transactions, and transfers between your own accounts (such as Revolut top-ups), are left out. We don’t ask for special categories of data (such as health or religion); please don’t put them in descriptions or notes.',
    },
    purposes: {
      title: 'Why we use it, and our legal basis',
      account: {
        name: 'Running your account and the app',
        what: 'Sign-in (including signing you in by itself once you confirm your email after signing up), storing and showing your records, budgets, insights, statements, backups and currency conversion, and working out the totals you ask for (such as Net, what you saved, and a late-month salary counted toward the next month).',
        basis: 'Contract — needed to provide the service you signed up for (Art. 6(1)(b) GDPR). For other people named in your own records, such as the payees on a statement you import, our and your legitimate interest in keeping your own accounts (Art. 6(1)(f)).',
      },
      groups: {
        name: 'Groups and bill splitting',
        what: 'Showing a group’s members, expenses, balances, comments and change log to its members; sending invites you ask us to send.',
        basis: 'Contract with you; for friends you add or invite, our and our users’ legitimate interest in splitting shared costs (Art. 6(1)(f)).',
      },
      messages: {
        name: 'Service messages',
        what: 'In-app notifications, and — if you turn them on — push notifications and emails about group invites and members joining or leaving, payment reminders and budget alerts.',
        basis: 'Contract. Push also needs your device’s permission; both switch off in Settings → Notifications.',
      },
      accountEmails: {
        name: 'Emails about your account and your data',
        what: 'Sent whatever your notification settings, and never with amounts or other records: a notice when this Privacy Notice or the Terms change; a confirmation when your account is deleted (by you, or after 2 years without use, following the warning); a security notice when a copy of your data is downloaded (at most one an hour) or your notification choices change (one summary per 15 minutes); and a receipt for a request sent with the privacy request form.',
        basis: 'Legal obligation to inform you about your data and your requests (Art. 6(1)(c), with Art. 12, 13 and 19 GDPR), and our legitimate interest in keeping your account secure (Art. 6(1)(f)).',
      },
      weekly: {
        name: 'Weekly summary',
        what: 'A weekly notification with how many expenses you logged and your top category.',
        basis: 'Consent (Art. 6(1)(a)). Off for new accounts; turn it on or off at any time in Settings → Notifications. Accounts created before 23 September 2026 keep their earlier setting and can switch it off the same way.',
      },
      ai: {
        name: 'AI helpers (optional)',
        what: 'Only for the helpers you turn on in Settings → AI helpers: filling in a new entry from a line you type (the line, your category names and which “Paid from” choices you have are sent), suggesting categories for new merchants when you import a statement (the merchant names, whether money went in or out, and your category names), a short summary of your month (your total per category for the month and the six before, and your budgets), and turning a what-if you type in Plan into changes to your plan (the line, and your recurring payments, income and savings: name, amount, currency and how often). Anthropic works out the answer; it only fills in or suggests things for you to check, and nothing is saved until you do. Your name, email and bank details, and your entries (their amounts, descriptions and notes), are never sent.',
        basis: 'Consent (Art. 6(1)(a)). Every helper is off until you turn it on, and you can turn it off at any time; each change is kept in your consent history.',
      },
      security: {
        name: 'Security and abuse prevention',
        what: 'Rate limits, sign-in sessions, password re-checks before account deletion, request logs.',
        basis: 'Legitimate interest in keeping accounts and the service safe (Art. 6(1)(f)).',
      },
      legal: {
        name: 'Legal obligations',
        what: 'Keeping a record of your consents (the app opens only once you’ve accepted the current Privacy Notice and Terms of Use), answering your privacy requests, handling security incidents, removing inactive accounts.',
        basis: 'Legal obligation (Art. 6(1)(c), with Art. 5(1)(e), 7(1) and 12–22 GDPR).',
      },
    },
    recipients: {
      title: 'Who receives it',
      intro: 'We share data only with the services below, each for the purpose described, and with authorities when the law requires it. Our processors act only on our instructions under a data processing agreement.',
      supabase: {
        name: 'Supabase (Supabase, Inc.)',
        role: 'Processor: database, sign-in, file storage (profile and group pictures) and server functions. It stores everything listed above. Its sign-in service also sends the emails that confirm your address, reset your password or sign you in; their links lead to budgeer.com, where the app hands the one-time code in the link back to Supabase to finish.',
        where: 'Our database is hosted in the EU: AWS region eu-west-3 (Paris, France). Supabase is a US company; its staff or sub-processors may access data from outside the EU for support and operations.',
        safeguard: 'Supabase’s Data Processing Addendum with the EU Standard Contractual Clauses.',
      },
      vercel: {
        name: 'Vercel (Vercel Inc.)',
        role: 'Processor: hosts the website and the app’s files. The data you enter doesn’t pass through it, but it sees your IP address and the pages you load.',
        where: 'A worldwide network, including the United States.',
        safeguard: 'Vercel’s Data Processing Addendum with the EU Standard Contractual Clauses (and the EU–US Data Privacy Framework where Vercel is certified).',
      },
      resend: {
        name: 'Resend (Plus Five Five, Inc.)',
        role: 'Processor: delivers our emails. It receives the recipient’s address and the email: the sign-in emails described above (confirm your email, reset your password, sign-in links), invites (your name and the group’s name), group event emails if you turned them on, the emails about your account and your data described above (inactivity warnings, deletion confirmations, security and update notices, privacy request receipts), privacy requests you send through the form (with what you wrote), and the replies we send you from privacy@ or support@. Our emails never contain your amounts or expense descriptions, and we don’t use open or click tracking.',
        where: 'Sent from the EU region eu-west-1 (Ireland); Resend is a US company.',
        safeguard: 'Resend’s Data Processing Addendum with the EU Standard Contractual Clauses.',
      },
      cloudflare: {
        name: 'Cloudflare (Cloudflare, Inc.)',
        role: 'Processor: manages the budgeer.com domain, protects and speeds up the website (so it sees your IP address and the pages you load), and receives emails sent to privacy@budgeer.com and support@budgeer.com and passes them on to our mailbox without keeping them.',
        where: 'A worldwide network, including the United States; Cloudflare is a US company.',
        safeguard: 'Cloudflare’s Data Processing Addendum with the EU Standard Contractual Clauses (and the EU–US Data Privacy Framework).',
      },
      gmail: {
        name: 'Google (Gmail)',
        role: 'Our privacy and support mailbox is a Gmail account. If you email privacy@ or support@, or use the privacy request form, your message and email address are stored there so we can answer; our replies are sent through Resend. We delete this correspondence when it’s no longer needed, and at the latest two years after the request is closed.',
        where: 'Google’s data centres worldwide; Google is a US company.',
        safeguard: 'The EU–US Data Privacy Framework (Google is certified) and Google’s terms.',
      },
      google: {
        name: 'Google',
        role: 'Independent controller — only if you use “Sign in with Google”. Google confirms who you are and shares your name, email address and profile picture with us. Your Google profile picture is loaded from Google’s servers, so Google sees your IP address when it’s shown.',
        where: 'Google’s own terms and privacy policy apply.',
      },
      apple: {
        name: 'Apple',
        role: 'Independent controller — only if you use “Sign in with Apple”. Apple confirms who you are and shares your email address with us (or, if you choose “Hide My Email”, a private relay address that forwards our emails to you) and, the first time, your name.',
        where: 'Apple’s own terms and privacy policy apply.',
      },
      push: {
        name: 'Your browser’s push service',
        role: 'Only if you turn on push: the push service of your browser’s maker (for example Google, Apple, Mozilla or Microsoft) delivers the notification. The message is encrypted so only your device can read it; the service sees the delivery address and timing.',
      },
      apns: {
        name: 'Apple Push Notification service (Apple Distribution International Ltd.)',
        role: 'Processor — only if you use the Budgeer iPhone app and allow its notifications: Apple delivers each notification to your iPhone. It receives the device token and the notification’s title and text (names and group names, never amounts) and when it’s sent.',
        where: 'Apple’s servers worldwide, including the United States.',
        safeguard: 'Apple’s Developer Program License Agreement, with the EU Standard Contractual Clauses for transfers outside the EU.',
      },
      frankfurter: {
        name: 'Frankfurter (frankfurter.dev)',
        role: 'A free, independent service that republishes the European Central Bank’s daily exchange rates. When you enter an amount in another currency, import a statement with rows in another currency, or open totals that include entries or recurring payments in another currency (converted at the latest rate), your browser asks it for the rates it needs: it receives only the currency codes and the dates — never an amount, a description or who you are — and, like any website, your IP address. Our server also fetches the daily rates from it, without any personal data, and uses that copy for the recurring totals in your statement.',
      },
      anthropic: {
        name: 'Anthropic (Anthropic, PBC)',
        role: 'Only if you turn on an AI helper: Anthropic’s Claude reads what that helper sends (described under “Why we use it”) and answers. Our server makes the request, so Anthropic doesn’t see your IP address or who you are. Anthropic doesn’t use it to train its models and deletes it after a short time, at most 30 days (longer only if its safety checks flag a request).',
        where: 'The United States; Anthropic is a US company.',
        safeguard: 'Anthropic’s commercial terms and data processing addendum with the EU Standard Contractual Clauses. Budgeer is a hobby project and uses these standard terms, with no special agreement.',
      },
      payments: {
        name: 'Revolut and PayPal',
        role: 'Only if you tap a Revolut or PayPal button when settling up: the link opens their site or app with your friend’s Revolut tag or PayPal.me name and the amount. Nothing is sent until you tap.',
      },
      users: {
        name: 'Other Budgeer users',
        role: 'Members of your groups see your name, profile picture, the group’s expenses, splits, balances, settlements, comments and change log, and your payment details if you added them. Someone with a group invite link sees the group’s name and picture, how many members it has, who invited them, and (once signed in) members’ names and pictures.',
      },
    },
    transfers: {
      title: 'Transfers outside the EU',
      body: 'Our database is stored in the EU. Where a provider above can access data from outside the European Economic Area (Supabase, Vercel, Resend, Cloudflare, Google, Apple and — if you turn on an AI helper — Anthropic are US companies), the transfer is covered by the European Commission’s Standard Contractual Clauses in that provider’s data processing agreement, and — for providers certified under it — by the EU–US Data Privacy Framework adequacy decision. Email us for a copy of the relevant safeguards.',
    },
    retention: {
      title: 'How long we keep it',
      account: '<lead>Your account and records:</lead> until you delete them or your account. That includes your settings (such as the salary setting and the last “What’s new” you’ve seen) and the savings choices on your categories, entries and recurring payments.',
      notifications: '<lead>Notifications:</lead> deleted automatically after {{days}} days.',
      groupLog: '<lead>Group change log:</lead> entries deleted automatically after {{years}} years.',
      invites: '<lead>Invites:</lead> links expire after 24 hours at most and are deleted a week after they expire.',
      rateLimits: '<lead>Rate-limit counters and sign-in audit records:</lead> deleted after {{days}} days at most.',
      mailbox: '<lead>Emails to privacy@ and support@:</lead> kept in our mailbox only as long as needed to answer and follow up, and deleted at the latest two years after your request is closed.',
      inactive: '<lead>Inactive accounts:</lead> if nobody has signed in to or used an account for {{warnMonths}} months, we email a warning; at {{deleteMonths}} months — and never sooner than {{noticeDays}} days after the warning — the account is deleted exactly as described under “Erasure”. Signing in stops it.',
      consents: '<lead>Consent history:</lead> kept while your account exists, to show what you agreed to.',
      aiSummaries: '<lead>Month summaries (AI helpers):</lead> one per month; writing a new one deletes those more than a year old, and all are deleted when you turn “Month in plain words” off. What an AI helper sends is deleted by Anthropic after at most 30 days.',
      backups: '<lead>Backups:</lead> our database host keeps encrypted backups for a limited period, so deleted data disappears from them when they roll over.',
    },
    rights: {
      title: 'Your rights and how to use them',
      intro: 'You can exercise any of these rights in the app or by emailing <email/>. It’s free. We answer within <lead>one month</lead> of receiving your request; for complex or many requests we may extend this by up to two further months, and we’ll tell you why within the first month (Art. 12(3) GDPR). We reply to the email address on your account, and may ask you to confirm a request comes from you.',
      access: {
        name: 'Access (Art. 15)',
        inApp: 'Settings → Privacy → Download my data: every piece of personal data we hold about you, as a JSON file.',
        byEmail: 'Ask for a copy, or for details about how we use your data.',
      },
      rectification: {
        name: 'Rectification (Art. 16)',
        inApp: 'Edit your name, picture and payment details (and your main currency, until you add entries) in Settings → Account, change your app settings (such as the salary setting) in Settings, and edit or delete any expense, income, category, budget, goal or recurring payment where it’s shown.',
        byEmail: 'For anything you can’t change yourself, such as your email address or an auto-categorising rule you saved while importing.',
      },
      erasure: {
        name: 'Erasure (Art. 17)',
        inApp: 'Settings → Security → Delete account. This permanently deletes your account, sign-in details and passkeys, profile and picture, payment details, expenses and income, categories and rules, accounts, budgets, goals, recurring payments, notifications (yours, and the ones other members received about something you did), push subscriptions, consent history, and the group comments you wrote. Groups you own pass to another member; a group with no other members is deleted with its picture.',
        whatStays: 'Group expenses, splits and settlements you were part of stay for the other members, because their balances depend on them — but your name there is replaced by “Former member” with no link to you, as it is in the group change log and its texts. The notifications other members received about something you did are deleted. A name you used before renaming yourself may still appear in older change-log texts until they are deleted after the periods above.',
        byEmail: 'Or ask us to delete specific data.',
      },
      restriction: {
        name: 'Restriction (Art. 18)',
        how: 'Use the request form in Settings → Privacy, or email us, to ask us to limit how we use your data while, for example, its accuracy is checked.',
      },
      portability: {
        name: 'Data portability (Art. 20)',
        inApp: 'Settings → Privacy → Download my data (machine-readable JSON). Settings → Your data also makes a backup you can restore into Budgeer.',
      },
      objection: {
        name: 'Objection (Art. 21)',
        how: 'Where we rely on legitimate interest (group sharing of data about friends you add, security measures), you can object on grounds relating to your situation — use the request form or email us. We don’t do direct marketing.',
      },
      withdraw: {
        name: 'Withdrawing consent (Art. 7(3))',
        inApp: 'Switch the weekly summary (and push or email notifications) off in Settings → Notifications, and any AI helper in Settings → AI helpers. Withdrawing doesn’t affect what we did before. Settings → Privacy shows your consent history.',
      },
      automated: {
        name: 'Automated decisions (Art. 22)',
        practice: 'We make no decisions about you based solely on automated processing that have legal or similarly significant effects. Auto-categorising and the AI helpers only fill in or suggest things for your own records, for you to check, and an import only leaves out what looks like a transfer between your own accounts, telling you how many it left out. The one automatic action on accounts is the inactivity clean-up above, which is announced by email first and stopped by signing in.',
      },
      complaint: {
        name: 'Complaint to a supervisory authority (Art. 77)',
        where: 'Belgian Data Protection Authority — Autorité de protection des données / Gegevensbeschermingsautoriteit (APD/GBA), Rue de la Presse 35 / Drukpersstraat 35, 1000 Brussels, Belgium · contact@apd-gba.be · +32 2 274 48 00 · www.dataprotectionauthority.be',
        also: 'You may complain to the data protection authority of the EU country where you live or work, or where you think the problem happened. We’d appreciate the chance to sort it out with you first.',
      },
    },
    security: {
      title: 'How we protect it',
      https: 'Everything travels over encrypted (HTTPS) connections.',
      encrypted: 'Amounts, descriptions, notes, comments, balances, budgets, goals, the group change log and your payment details are encrypted in the database with a key kept separately in Supabase Vault. This isn’t end-to-end encryption: the server decrypts them to show them to you and your groups.',
      rls: 'Row-level security in the database stops other users from reading your records.',
      passwords: 'Passwords are hashed by Supabase Auth; passkeys are supported; deleting an account asks for your password again (or a typed confirmation if you sign in with Google).',
      rateLimits: 'Rate limits protect invites, emails, reports, comments and data exports from abuse.',
      breach: 'If a personal data breach happens, we notify the Belgian Data Protection Authority within 72 hours where required, and tell you without undue delay if it is likely to put your rights at high risk.',
    },
    device: {
      title: 'Storage on your device (no cookies)',
      intro: 'Budgeer sets no cookies and uses no tracking. It keeps a few items in your browser’s storage that are strictly necessary for the service you asked for, or that remember your own choices — so no consent banner is needed:',
      session: '<lead>Sign-in session</lead> (Supabase’s <code>sb-…-auth-token</code>): keeps you signed in on this device; removed when you sign out.',
      offline: '<lead>Offline copy</lead> (service worker caches <restCache/> and <rpcCache/>, with their timestamps in <expirationDb/>): recently loaded data so the app opens offline; each item expires after a day, and all of it is cleared when you sign out.',
      appFiles: '<lead>App files</lead> (service worker cache): the app’s own code, styles, fonts and icons, so it starts quickly and works offline. None of your data; replaced when the app updates.',
      choices: '<lead>Your choices:</lead> light/dark appearance (<appearance/>), the app’s language (<language/>), the dashboard chart/table view (<overviewView/>), whether Home’s overview shows numbers or the month in words (<overviewTab/>), that you’ve answered the notification prompt (<notifPrompted/>), and that you tapped “Not now” when Settle up suggested adding your payment details (<paymentAskDismissed/>), so we don’t ask again on this device.',
      recentGroups: '<lead>Recently used groups</lead> (<recentGroups/>): the groups you last added a shared expense to, so “Who’s it for?” on Add offers them first. Only group IDs — no names or amounts.',
      importChoices: '<lead>Import column choices</lead> (<importMappings/>): how you matched the columns of your last few imported spreadsheet layouts, so the next file from the same bank skips that step. Only column headings and your choices — no transactions. With it, your name as your bank writes it (<importHolder/>), typed in “Your name as banks write it” on the import screen (we suggest your profile name) or taken from a statement that names you, so transfers between your own accounts are left out of the next import too. Your name here never leaves this device.',
      rates: '<lead>Exchange rates</lead> (<fxRatePrefix/>): rates already looked up, so they aren’t fetched again. Only currency codes, dates and rates.',
      signIn: '<lead>Sign-in helpers:</lead> a pending group invite while you sign up (<pendingInvite/>, removed once you join) and the page to return to after signing in through Google or an email link (<returnPath/>, removed once used and ignored after an hour).',
      acceptance: '<lead>Your acceptance of these terms</lead> (<legalAccepted/>): your account ID and the versions of this notice and the Terms of Use you accepted, so the app still opens when it can’t reach our server to check. Only used offline; removed when you sign out.',
      tab: '<lead>This tab only</lead> (session storage, gone when you close the tab): the email address you’re confirming after signing up (<pendingEmail/>), that you’ve seen the passkey prompt (<passkeyPrompted/>), that you’re connecting Google or Apple in Settings, and which (<linkingProvider/>), and, when you sign up with Google or Apple, the versions of this notice and the Terms you ticked and when, so your acceptance is recorded once you’re back (<legalConsentPending/>, removed on arrival and ignored after 30 minutes), and when the app last reloaded itself onto a new version because a page failed to load, with the technical error (<chunkReload/>, so it reloads only once).',
      retired: '<lead>Left from earlier versions:</lead> the last “What’s new” you’d seen on this device (<whatsNewSeen/>). The app now keeps this with your account: it moves the value there once, then deletes it from the device. And the month you’d hidden Home’s AI summary card for (<aiSummaryHidden/>): that card is gone, so the app deletes it.',
      sent: 'All of it stays on your device. The app sends the sign-in session with its requests, to prove it’s you when it loads your data; otherwise an item is only sent for the step it exists for — the pending invite when you join the group, and the email address you’re confirming if you ask for the email again. Signing out removes the session, the offline copy and the record of your acceptance, and closing the tab removes the tab-only items. You can clear the rest at any time by deleting this site’s data in your browser’s settings.',
      password: 'Your password is never kept in browser storage. Right after you sign up, the “Check your inbox” page holds the password you just typed in the page’s memory only, so it can sign you in by itself as soon as you confirm your email (on any device). It tries again every few seconds and forgets the password as soon as you’re signed in, you leave or reload the page, or after 15 minutes at most.',
    },
    children: {
      title: 'Children',
      body: 'Budgeer is not intended for anyone under 16, and you must be 16 or older to create an account. We don’t knowingly collect data about children; if you believe a child has an account, email <email/> and we will delete it.',
    },
    changes: {
      title: 'Changes to this notice',
      body: 'This is version {{version}}. When we change this notice in a way that matters, we publish a new version with a new date and ask you to review and accept it the next time you open the app; earlier versions are available on request. See also the <terms>Terms of Use</terms>.',
    },
  },
  terms: {
    eyebrow: 'Terms of Use',
    title: 'The terms for using Budgeer',
    intro: 'The rules for using Budgeer, in plain language: what the service is — and isn’t — what we expect from you, and what you can expect from us.',
    about: {
      title: 'About these terms',
      body: 'These terms are an agreement between you and <strong>{{controller}}</strong> (“we”), which provides the Budgeer app and budgeer.com. By creating an account you accept them and confirm you have read the <privacy>Privacy Notice</privacy>. For questions about the service, contact <support/>; for anything about your personal data, <privacyEmail/>.',
    },
    service: {
      title: 'What Budgeer is — and isn’t',
      body: '<strong>Budgeer is a free hobby project, run by one person in their spare time.</strong> It helps you keep track of your own spending and income and split shared costs with friends, for personal, non-commercial use. It is not a business service: there is no subscription, no service-level promise and no guaranteed support.',
      notFinancial: 'Budgeer is not a bank, a payment service, an e-money or investment service, or a financial, tax or legal adviser. It never holds, moves or collects money, and it doesn’t connect to your bank accounts.',
      asIs: 'It is provided free of charge, “as is” and “as available”. We don’t promise that it will always be available, work without interruption or errors, keep your data forever, or keep every feature.',
      accuracy: 'We don’t guarantee that anything it shows is accurate, complete or up to date — see “No financial advice” below.',
    },
    advice: {
      title: 'No financial advice',
      recordsOnly: 'Budgeer only records and organises the data you enter. Nothing in it is financial, investment, tax or legal advice, or a recommendation to do anything with your money.',
      figures: 'Figures can be wrong. Calculations, totals and balances, exchange rates (the European Central Bank’s daily reference rates, or an estimate until they arrive), projections, budget alerts, yearly subscriptions spread over months, bank-statement imports and receipt scans may be inaccurate or incomplete.',
      estimates: 'Some figures are estimates built only from what you enter and those reference rates: recurring totals in other currencies (converted at the latest rate, not the rate you’ll actually pay), a late-month salary counted toward the next month, what you saved, and Net. They are not a statement of your real balance or financial advice.',
      imports: 'A bank-statement import guesses for you: it leaves out what looks like a transfer between your own accounts, and it groups merchants and suggests categories from the text of each line. These guesses can be wrong — check what was imported and what was left out.',
      responsibility: 'You are responsible for your own decisions and for checking figures. Always check important amounts against your bank statements before relying on them or paying anyone, and ask a qualified professional before making financial, tax or legal decisions.',
    },
    account: {
      title: 'Your account',
      age: 'You must be at least 16 years old and give a valid email address that you control.',
      secure: 'Keep your password secret and your devices secure; you’re responsible for what happens in your account. Tell us at once if you think someone else has accessed it.',
      onePerPerson: 'One account per person. Don’t create accounts for others or with someone else’s email address.',
    },
    content: {
      title: 'What you enter and your group arrangements',
      yours: 'You are responsible for what you enter — amounts, descriptions, comments, names and pictures — and for checking it is correct. Your data stays yours; you give us only the permission needed to store, process and show it to run the service for you, and to show group data to the members of that group.',
      arrangements: 'Arrangements between you and your friends are yours. Budgeer doesn’t hold, move or collect money, and it isn’t a party to what you agree in a group. Balances are a record to help you settle up; check them together before paying.',
      payments: 'Revolut and PayPal buttons only open your own payment app or website with the details filled in; the payment is between you and that provider, under their terms.',
      others: 'When you add friends to a group or invite them by email, you share their name or email address with us. Only do that for people who would expect it, and keep descriptions and comments about others fair and relevant.',
      special: 'Don’t put special categories of data (such as health information) or anything unlawful in descriptions, notes, comments, names or pictures.',
    },
    use: {
      title: 'Acceptable use',
      intro: 'Don’t use Budgeer to:',
      law: 'break the law, or harass, deceive or harm anyone;',
      spam: 'send unwanted invites or messages, or get around rate limits;',
      access: 'access data or accounts that aren’t yours, probe or break the service’s security, or overload it;',
      copy: 'copy, resell or build a competing service from Budgeer’s code or data by automated means.',
      report: 'If you find a security problem, please tell us at <support/> rather than exploiting it.',
    },
    liability: {
      title: 'Limitation of liability',
      limit: 'Budgeer is free and provided as a hobby, so to the fullest extent Belgian law allows, we are not liable for any loss or damage arising from your use of Budgeer, from it being unavailable, or from relying on its figures — including financial losses, lost data or backups, missed or wrong payments, disagreements within a group, or decisions you make based on the app — nor for indirect or consequential loss.',
      exceptions: 'This never excludes or limits our liability for intent or fraud, for gross negligence, or for death or personal injury, or anything else the law doesn’t allow us to exclude, and it doesn’t affect any mandatory right you have as a consumer under Belgian or EU law.',
    },
    availability: {
      title: 'Changes and shutting down',
      changes: 'We may change, pause or remove features, or take Budgeer offline for maintenance, without notice when that’s needed to keep it working or secure.',
      shutdown: 'We may stop offering Budgeer altogether. If we do, we will tell you in advance where possible — at least 30 days before it shuts down — so you can download your data (Settings → Privacy) or a backup (Settings → Your data) first.',
    },
    ending: {
      title: 'Ending your use',
      you: 'You can stop at any time and delete your account in Settings → Security; the Privacy Notice explains what is deleted and what stays for your groups.',
      us: 'We may suspend or close an account that seriously or repeatedly breaks these terms, after warning you where reasonable.',
      inactive: 'Accounts nobody has used for {{months}} months are deleted after an email warning, as the Privacy Notice explains.',
    },
    changes: {
      title: 'Changes to these terms',
      body: 'This is version {{version}}. If we change these terms, we publish a new version with a new date and ask you to accept it the next time you open the app. If you don’t agree, you can download your data and delete your account instead.',
    },
    law: {
      title: 'Law and disputes',
      body: 'These terms are governed by Belgian law, and the courts of Belgium have jurisdiction — without depriving you of the protection of the mandatory consumer rules and courts of the country where you live. Please contact us first at <support/>; most issues can be solved quickly.',
    },
  },
  gate: {
    firstTitle: 'Please accept to continue',
    updateTitle: 'We’ve updated our terms',
    firstBody: 'To use Budgeer, please read and accept our Privacy Notice and Terms of Use.',
    updateBody: 'Please review the changes to our Privacy Notice and Terms of Use to keep using Budgeer.',
    version: 'Version {{date}}.',
    read: 'Read the <privacy>Privacy Notice</privacy> and the <terms>Terms of Use</terms>.',
    firstDeclined: 'Without accepting, you can’t use Budgeer. You can delete the account you just created or sign out.',
    updateDeclined: 'Without accepting, you can’t keep using Budgeer. You can still take your data with you or delete your account.',
    download: 'Download my data',
    gathering: 'Gathering your data…',
    downloaded: 'Your data was downloaded',
    downloadFailed: 'Couldn’t download your data',
    delete: 'Delete my account',
    signOut: 'Sign out',
    disagree: 'I don’t agree',
    accept: 'Accept and continue',
    acceptFailed: 'Couldn’t save your acceptance',
    // What changed, per LEGAL_CHANGES version (supabase/functions/_shared/legal.ts,
    // which the update emails quote): keep these items identical to its
    // `items`. A version missing here is listed from legal.ts, in English.
    changes: {
      '2026-09-29': {
        helpers: 'Optional AI helpers, each off until you turn it on in Settings → AI helpers: filling in an entry from a line you type, category ideas for new merchants on import, a short summary of your month, and changes to your plan from a what-if you type.',
        anthropic: 'If you turn one on, only what it needs is sent to Anthropic (Claude), a US company, under its standard data processing terms. Anthropic doesn’t use it to train its models and deletes it within 30 days. Your name, email and bank details are never sent.',
        summaries: 'Month summaries are kept for a year and deleted when you turn the helper off.',
      },
      '2026-09-23': {
        notice: 'A full Privacy Notice: who is responsible for your data, why we use it and on what legal basis, who processes it and where, and how long we keep it.',
        terms: 'New Terms of Use for the app: Budgeer is a free hobby project provided as is, not a bank or financial service, and does not give financial advice.',
        rights: 'Your rights, with a way to exercise each one in Settings → Privacy.',
        cleanUp: 'Automatic clean-up: notifications after 90 days, group change logs after 2 years, and accounts unused for 2 years (after an email warning).',
        weekly: 'The weekly summary is now optional and off for new accounts.',
      },
    },
  },
  // The consent history rows (legal.js describeConsent). `purposes` mirrors
  // CONSENT_LABELS in supabase/functions/_shared/legal.ts.
  consent: {
    purposes: {
      privacy_notice: 'Privacy Notice',
      terms: 'Terms of Use',
      weekly_digest: 'Weekly summary',
      email_notifications: 'Email notifications',
      push_notifications: 'Push notifications',
      ai_quick_entry: 'AI helper: Type to add',
      ai_import_categories: 'AI helper: Category ideas on import',
      ai_month_summary: 'AI helper: Month in plain words',
      ai_plan_whatif: 'AI helper: What-if in your own words',
    },
    unknown: 'Unknown',
    accepted: 'Accepted the {{document}}{{version}}{{where}}',
    declined: 'Declined the {{document}}{{version}}{{where}}',
    version: 'version {{date}}',
    turnedOn: '{{what}} turned on{{where}}',
    turnedOff: '{{what}} turned off{{where}}',
    sources: {
      signup: 'when you signed up',
      prompt: 'after an update',
      settings: 'in Settings',
    },
  },
  settings: {
    title: 'Privacy',
    description: 'Your data rights, consents and requests',
    intro: 'You have these rights under the GDPR. Use them here, or email <email/> — we answer within one month. Details are in the <privacy>Privacy Notice</privacy> and the <terms>Terms of Use</terms>.',
    correct: {
      title: 'Correct your data',
      text: 'Change your name, picture, currency and payment details, or edit any expense, income, budget or recurring payment where it’s shown. For anything else, such as your email address, send a request below.',
      profile: 'Edit profile',
      transactions: 'Your transactions',
    },
    delete: {
      title: 'Delete your account',
      text: 'Permanently deletes your account and personal data. Group expenses you were part of stay for the other members, shown as “Former member” with no link to you. The delete screen lists exactly what goes and what stays.',
      go: 'Go to Delete account',
    },
    consent: 'Withdraw or give consent',
    automated: {
      title: 'Automated decisions',
      text: 'We make no decisions about you based solely on automated processing with legal or similarly significant effects. The one automatic action is deleting accounts unused for 2 years — only after an email warning, and logging in stops it.',
    },
    complain: {
      title: 'Complain to a supervisory authority',
      text: 'Belgian Data Protection Authority (APD/GBA), Rue de la Presse 35 / Drukpersstraat 35, 1000 Brussels · contact@apd-gba.be · +32 2 274 48 00 · www.dataprotectionauthority.be — or the authority where you live or work.',
    },
    download: {
      title: 'Download your data',
      text: 'One JSON file with everything we hold about you: account and profile, payment details, consents, notifications, devices for push (service only), categories, rules, accounts, budgets, goals, recurring payments, transactions, and your part of your groups. Nothing about other people beyond what you already see in the app.',
      button: 'Download my data',
      backup: 'Backup and restore',
      unprotected: 'The file isn’t password-protected — keep it somewhere safe.',
    },
    request: {
      title: 'Restrict or object, or another request',
      text: 'Ask us to limit how we use your data, object to a use based on our legitimate interest, or make any other privacy request. It goes to our privacy inbox, and we reply to your account’s email address.',
      send: 'Send a request',
      email: 'Email instead',
    },
    history: {
      title: 'Your consent history',
      empty: 'Nothing recorded yet.',
    },
    articles: {
      download: 'Art. 15 and 20',
      correct: 'Art. 16',
      delete: 'Art. 17',
      request: 'Art. 18 and 21',
      automated: 'Art. 22',
      complain: 'Art. 77',
    },
  },
  // `kinds` and `errors` mirror REQUEST_KINDS and validatePrivacyRequest in
  // supabase/functions/_shared/privacyRequest.ts (the edge function answers
  // in English).
  request: {
    eyebrow: 'Privacy',
    title: 'Privacy request',
    send: 'Send request',
    about: 'What is it about?',
    kinds: {
      restrict: 'Restrict processing (Art. 18)',
      object: 'Object to processing (Art. 21)',
      access: 'Access my data (Art. 15)',
      rectify: 'Correct my data (Art. 16)',
      erase: 'Erase my data (Art. 17)',
      portability: 'Data portability (Art. 20)',
      other: 'Other privacy question',
    },
    yourRequest: 'Your request',
    placeholder: 'Tell us what you’d like us to do, and which data it concerns.',
    help: 'We answer within one month. Up to 3 requests a day.',
    sent: 'Request sent',
    sentBody: 'We’ve emailed you a receipt, and we’ll reply to your account’s email address by {{date}}.',
    failed: 'Couldn’t send your request',
    errors: {
      kind: 'Choose what your request is about.',
      short: 'Tell us a little more (at least 10 characters).',
      long: 'Keep it under {{max}} characters.',
    },
  },
  checkError: {
    title: 'We couldn’t check your account',
    retry: 'Try again',
    checking: 'Checking…',
    logOut: 'Log out',
  },
}
