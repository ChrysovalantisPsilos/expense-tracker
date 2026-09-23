// The Help & FAQ page's questions and answers. Plain data: each section has an
// `id` and `title`; each item an `id` (its #anchor, lowercase-with-dashes and
// unique across the page), a question `q` and an answer `a` (one string per
// paragraph); optionally numbered `steps` and a `media` illustration — an
// install guide ({ type: 'install', platform }) or a short clip from the app
// ({ type: 'clip', name, alt }: public/faq-media/<name>.webm + .mp4, .jpg poster). Every
// answer must stay true to the app — update it alongside any change to the
// feature it describes (and re-record its clip).
import { SUPPORT_EMAIL, PRIVACY_EMAIL } from '../../shared/lib/contact.js'

export const FAQ_SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    items: [
      {
        id: 'what-is-budgeer',
        q: 'What is Budgeer?',
        a: [
          'Budgeer is an expense tracker and bill splitter. Log what you spend and earn, set monthly budgets, keep an eye on subscriptions, and split costs with friends in groups.',
          'It runs in your browser and can be installed like an app on your phone or computer.',
        ],
      },
      {
        id: 'is-it-free',
        q: 'Does Budgeer cost anything?',
        a: ['No. Budgeer is free, with no limits on how much you track and no ads.'],
      },
      {
        id: 'compared-to-others',
        q: 'How is Budgeer different?',
        a: [
          'Most money apps do one of two things: bill splitters look after shared costs with friends, and budgeting apps look after your own money. Budgeer does both in one place.',
          'Your budget and your groups in one app. Track your own spending against monthly budgets and split costs with friends in the same place. Your share of a group expense lands in your own spending automatically, converted at the European Central Bank rate for the day.',
          'Free, with no daily cap and no ads. Every feature is free. There’s no daily limit on how many expenses you add — only hourly safety limits against abuse — and no ads or analytics trackers.',
          'Private by default. Your data is stored in the EU (Paris). Amounts and descriptions are encrypted at rest on the server — that’s not end-to-end encryption. Receipts are read on your device and never uploaded.',
          'Where others are better: Budgeer has no live bank connection — you import CSV or Excel statements instead. It isn’t in the App Store or Google Play; you install it from your browser. And it’s a one-person hobby project, so it has less polish than long-established apps, and support replies can take a few days.',
        ],
      },
      {
        id: 'financial-advice',
        q: 'Is Budgeer a financial service? Does it give financial advice?',
        a: [
          'No. Budgeer is a free hobby project, built and run by one person in their spare time. It isn’t a bank, a payment service, a financial adviser or any other regulated financial service: it never holds, moves or collects money, and it can’t see your bank accounts. It’s a tool for recording and organising the numbers you enter yourself.',
          'It doesn’t give financial, investment, tax or legal advice, and nothing in it is a recommendation to do anything with your money. Its figures — including exchange rates, projections, budget alerts, spread-out subscriptions, balances, imports and receipt scans — may contain mistakes. It’s provided as is, without guarantees, so check important numbers against your bank statements, and ask a qualified professional when you need advice.',
          'The decisions you make with it, and settling up with friends, are up to you. The Terms of Use set this out in full.',
        ],
      },
      {
        id: 'who-runs-budgeer',
        q: 'Who runs Budgeer?',
        a: [
          'One person, in their spare time, from Belgium. There’s no company or support team behind it, and it’s free because it’s a hobby. It’s looked after with care, but it can have bugs or downtime, features can change, and support replies may take a few days.',
          'If Budgeer ever has to close, you’ll be told in advance where possible, with time to download your data.',
          `For help or to report a problem, email ${SUPPORT_EMAIL}; for anything about your personal data, email ${PRIVACY_EMAIL}.`,
        ],
      },
      {
        id: 'sign-in-options',
        q: 'How can I sign in?',
        a: [
          'With your email address and a password, with “Sign in with Google”, or with a passkey once you’ve added one on your device.',
        ],
      },
      {
        id: 'app-tour',
        q: 'Can I see the app tour again?',
        a: ['Yes. Go to Settings → Help → Take the tour again.'],
      },
    ],
  },
  {
    id: 'install',
    title: 'Install Budgeer on your phone',
    items: [
      {
        id: 'install-app',
        q: 'Can I install Budgeer like an app?',
        a: [
          'Yes. Budgeer is a web app: you install it straight from your browser, not from the App Store or Google Play. It’s free and takes a few seconds.',
          'Pick your device below. Once installed, Budgeer opens from its own icon, full screen, like any other app.',
        ],
      },
      {
        id: 'install-iphone',
        q: 'How do I install it on an iPhone or iPad?',
        a: ['Use Safari:'],
        steps: [
          'Open www.budgeer.com in Safari.',
          'Tap the Share button — the square with an arrow pointing up. It’s at the bottom of the screen on an iPhone (tap ⋯ first if you don’t see it) and at the top right on an iPad.',
          'Scroll down the list and tap Add to Home Screen.',
          'Tap Add. Budgeer’s icon appears on your home screen.',
        ],
        media: { type: 'install', platform: 'iphone' },
      },
      {
        id: 'install-android',
        q: 'How do I install it on an Android phone?',
        a: ['Use Chrome:'],
        steps: [
          'Open www.budgeer.com in Chrome.',
          'Tap the ⋮ menu at the top right.',
          'Tap Install app (on some phones it says Add to Home screen, then Install).',
          'Confirm with Install. Budgeer’s icon appears with your other apps.',
        ],
        media: { type: 'install', platform: 'android' },
      },
      {
        id: 'install-samsung',
        q: 'How do I install it with Samsung Internet?',
        a: ['On a Samsung phone’s own browser:'],
        steps: [
          'Open www.budgeer.com in Samsung Internet.',
          'Tap the menu (three lines) at the bottom right.',
          'Tap Add page to, then Home screen. If the address bar shows an install icon, you can tap that instead.',
          'Tap Add. Budgeer’s icon appears on your home screen.',
        ],
        media: { type: 'install', platform: 'samsung' },
      },
      {
        id: 'install-desktop',
        q: 'Can I install it on my computer?',
        a: ['Yes, in Chrome or Edge:'],
        steps: [
          'Open www.budgeer.com.',
          'Click the install icon at the right of the address bar (a screen with an arrow).',
          'Click Install. Budgeer opens in its own window and can be pinned to your taskbar or dock.',
        ],
        media: { type: 'install', platform: 'desktop' },
      },
      {
        id: 'install-benefits',
        q: 'What changes once it’s installed?',
        a: [
          'It opens from its own icon, full screen, without the browser’s address bar.',
          'It opens even offline and shows your recently loaded data; adding or changing anything still needs a connection.',
          'On an iPhone or iPad, notifications only work once Budgeer is installed on your home screen. On Android and computers they work in the browser too.',
          'It updates itself automatically — there’s nothing to download from a store. Your data lives in your account, not on the phone, so removing the app later doesn’t delete anything.',
        ],
      },
    ],
  },
  {
    id: 'expenses-income',
    title: 'Expenses & income',
    items: [
      {
        id: 'add-expense',
        q: 'How do I add an expense or income?',
        a: [
          'Open Transactions and tap Add. Enter the amount, currency, date, category and a description, plus notes if you like, then save. Tapping an entry later opens the same page so you can edit it.',
          'To make it repeat, fill in the Repeat section on the same page (see “How do I make an expense repeat?”).',
        ],
      },
      {
        id: 'find-transaction',
        q: 'How do I find an old transaction?',
        a: [
          'Use the search box on the Transactions page, or the filters next to it (category, amount range and dates). With no search it shows this month; searching looks through all your history.',
        ],
      },
      {
        id: 'category-page',
        q: 'How do I see everything I spent in one category?',
        a: [
          'Tap the category on Home, or its budget on the Budgets page. That opens the category’s page with its expenses, and you can edit them right there.',
        ],
      },
    ],
  },
  {
    id: 'subscriptions-recurring',
    title: 'Subscriptions & recurring',
    items: [
      {
        id: 'make-recurring',
        q: 'How do I make an expense repeat?',
        a: [
          'When you add or edit an expense, use its Repeat section: choose weekly, monthly, quarterly or yearly, and how often (every 1, 2, 3… of those). Then set the next date, an optional end date, and an optional reminder a few days before it’s due.',
        ],
        media: {
          type: 'clip',
          name: 'repeat-expense',
          alt: 'Screen recording: on the new expense page, entering 12.99 for a gym membership, switching on Repeat — monthly by default, with the next charge date filled in — then saving it.',
        },
      },
      {
        id: 'recurring-page',
        q: 'Where do I see my subscriptions and regular income?',
        a: [
          'On the Recurring page (under More on a phone). The Subscriptions tab lists what you pay regularly; the Income tab lists money that comes in regularly, such as a salary.',
          'Home also has a Subscriptions card with tabs for each frequency, so you can see what your weekly, monthly or yearly payments add up to.',
        ],
      },
      {
        id: 'yearly-subscriptions',
        q: 'How do yearly subscriptions count in my monthly spending?',
        a: [
          'By default a yearly payment is spread evenly over the 12 months it covers, so a €120 subscription counts as €10 a month in your totals and budgets.',
          'If you’d rather keep them separate, turn that off in Settings → Monthly spending. Yearly subscriptions then stay out of your monthly totals and budgets and are shown in their own card on Home.',
        ],
        media: {
          type: 'clip',
          name: 'yearly-subscription',
          alt: 'Screen recording: adding a car insurance of 480 euros that repeats yearly; the form shows it counts as 40 euros a month in budgets. Then Home’s Subscriptions card is switched to its Yearly tab.',
        },
      },
      {
        id: 'payment-reminders',
        q: 'Can Budgeer remind me before a bill is due?',
        a: [
          'Yes. Set a reminder in the Repeat section and you’ll get a notification that many days before the payment is due.',
        ],
      },
    ],
  },
  {
    id: 'budgets-categories',
    title: 'Budgets & categories',
    items: [
      {
        id: 'budgets-how',
        q: 'How do budgets work?',
        a: [
          'Set a monthly limit for a category on the Budgets page. A budget carries on from month to month until you delete it, so you only set it up once.',
          'You’ll get a notification when a category is nearly at its budget and when it goes over. Tap a budget to see its expenses and edit it.',
        ],
        media: {
          type: 'clip',
          name: 'category-budget',
          alt: 'Screen recording: on the Budgets page, tapping the Food & Dining budget opens the category’s page with its budget and expenses; tapping Edit, the monthly budget is changed to 300 euros and saved.',
        },
      },
      {
        id: 'manage-categories',
        q: 'Can I change the categories?',
        a: [
          'Yes. In Settings → Categories you can add, rename, recolour or archive categories.',
        ],
      },
    ],
  },
  {
    id: 'groups-splitting',
    title: 'Groups & splitting',
    items: [
      {
        id: 'invite-friends',
        q: 'How do I invite friends to a group?',
        a: [
          'Open the group and tap its members, then Copy link under Invite people, or Email to send an invite by email. A link works for at most 24 hours, so share it only with people you want in the group.',
          'Friends without an account can create one for free from the link and join straight away.',
        ],
        media: {
          type: 'clip',
          name: 'invite-friends',
          alt: 'Screen recording: opening the Lisbon weekend group, tapping its members, and tapping Copy link under Invite people; the invite link is copied, ready to paste into a chat.',
        },
      },
      {
        id: 'split-options',
        q: 'How can I split an expense?',
        a: [
          'Equally, by exact amounts, by percentages, or by shares (for example 2 shares for a couple and 1 for a single person). Each expense can be in its own currency, and Budgeer converts it for the group’s balances.',
        ],
      },
      {
        id: 'settle-up',
        q: 'How do we settle up?',
        a: [
          'Tap Settle up in the group. Budgeer suggests the fewest payments that clear everyone’s balance. If the person you’re paying has added payment details, you’ll see their IBAN, or a Revolut or PayPal link that opens with the amount filled in. Record the payment in Budgeer once it’s sent.',
          'You can add your own details in Settings → Account → Getting paid.',
        ],
        media: {
          type: 'clip',
          name: 'settle-up',
          alt: 'Screen recording: in the Lisbon weekend group, the balances show who is owed; Who owes whom lists the fewest payments that clear everyone, and Settle up fills in a suggested payment to record once it’s paid.',
        },
      },
      {
        id: 'group-reminders',
        q: 'Can I remind someone who owes me?',
        a: [
          'Yes. When settling up, you can send a friendly reminder to a member who owes money. They get a notification — no amounts are included.',
        ],
      },
    ],
  },
  {
    id: 'currencies',
    title: 'Currencies',
    items: [
      {
        id: 'foreign-currency',
        q: 'Can I add expenses in another currency?',
        a: [
          'Yes. Pick the currency you paid in, and Budgeer converts it to your main currency at the European Central Bank’s reference rate for that day. Each expense keeps its rate, so past totals don’t shift later.',
          'The ECB publishes rates on working days, in the afternoon. Until that day’s rate is out, the conversion shows as pending and is filled in automatically once it’s available.',
        ],
      },
      {
        id: 'main-currency',
        q: 'How do I change my main currency?',
        a: ['In Settings → Account → Default currency.'],
      },
    ],
  },
  {
    id: 'import-receipts',
    title: 'Import & receipts',
    items: [
      {
        id: 'bank-import',
        q: 'Can I import my bank statement?',
        a: [
          'Yes. On Transactions, open the ⋯ menu and choose Import. Upload a CSV or Excel file exported from your bank. Budgeer recognises exports from BNP Paribas Fortis, ING, KBC, Crelan, Piraeus, Alpha Bank, Eurobank (Hellenic) and Revolut automatically.',
          'The file is read on your device, and only the transactions you import are saved. Importing the same file twice doesn’t create duplicates.',
        ],
        media: {
          type: 'clip',
          name: 'bank-import',
          alt: 'Screen recording: on the Import page, choosing a CSV bank statement; Budgeer recognises the columns and shows a preview of the transactions before importing them.',
        },
      },
      {
        id: 'receipt-scan',
        q: 'How does receipt scanning work?',
        a: [
          'When adding an expense, scan or pick a photo of a receipt, and Budgeer fills in the amount and date. It reads English and Greek receipts.',
          'The scan happens entirely on your device: the photo is never uploaded or stored. Always check the result before saving.',
        ],
      },
    ],
  },
  {
    id: 'reports-backups',
    title: 'Reports & backups',
    items: [
      {
        id: 'statements',
        q: 'Can I get a statement of my spending?',
        a: [
          'Yes. On the Insights page, choose a date range and export it as a PDF or an Excel file.',
        ],
      },
      {
        id: 'backups',
        q: 'How do I back up my data?',
        a: [
          'In Settings → Your data, download a backup file. You can protect it with a password; keep that password safe, because a protected file can’t be restored without it.',
          'Restoring merges the backup into your account and skips entries you already have. Your shares of group expenses come back as personal expenses.',
        ],
      },
    ],
  },
  {
    id: 'account-security',
    title: 'Account & security',
    items: [
      {
        id: 'passkeys',
        q: 'What is a passkey?',
        a: [
          'A passkey lets you sign in with your fingerprint, face or device PIN instead of a password. It’s saved and synced by your device’s password manager, such as iCloud Keychain, Google Password Manager or 1Password.',
          'Budgeer only stores the public half of the passkey, which can’t be used to sign in on its own. Add one on each device you use, in Settings → Security.',
        ],
      },
      {
        id: 'passkey-reminder',
        q: 'How do I stop the reminder to add a passkey?',
        a: [
          'Choose “Don’t remind me again” in the reminder. Your choice is saved to your account, so your other devices won’t ask either.',
        ],
      },
      {
        id: 'notifications',
        q: 'What notifications does Budgeer send?',
        a: [
          'Push notifications for group activity, bill reminders and budget alerts, and emails for bigger events such as group invites. There’s also an optional weekly summary; new accounts need to turn it on.',
          'Notifications and emails say what happened, never the amounts or descriptions. Choose what you get in Settings → Notifications.',
          `A few emails about your account and your data are always sent, whatever those switches say: when the Privacy Notice or Terms change, when your account is deleted, when a copy of your data is downloaded or your notification choices change (so you’d notice if it wasn’t you), and a receipt when you send a privacy request. Replying to one reaches ${PRIVACY_EMAIL}.`,
        ],
      },
      {
        id: 'delete-account',
        q: 'What happens if I delete my account?',
        a: [
          'Your account and personal records are permanently deleted (Settings → Security → Delete account lists exactly what goes). Expenses you shared in groups stay for the other members, so their balances still add up, but they show “Former member” instead of your name, with no link to you.',
          'Download your data (Settings → Privacy) or a backup (Settings → Your data) first if you might want it later.',
        ],
      },
    ],
  },
  {
    id: 'privacy-data',
    title: 'Privacy & data',
    items: [
      {
        id: 'encryption',
        q: 'Is my data encrypted?',
        a: [
          'Yes, in two ways. Everything travels over encrypted (HTTPS) connections, and in the database your amounts, descriptions, notes and payment details are encrypted, with the key kept separately.',
          'This isn’t end-to-end encryption. Budgeer’s server can decrypt your data to show it to you and to the members of your groups. The encryption protects it if a copy of the database ever leaked.',
        ],
      },
      {
        id: 'ads-tracking',
        q: 'Do you show ads or track me?',
        a: [
          'No. There are no ads, no analytics or tracking scripts, and we don’t sell your data.',
        ],
      },
      {
        id: 'download-delete-data',
        q: 'How do I download or delete my data?',
        a: [
          'Settings → Privacy → Download my data saves everything we hold about you as one file. To delete your account, go to Settings → Security → Delete account (Settings → Privacy links there too).',
        ],
        media: {
          type: 'clip',
          name: 'download-data',
          alt: 'Screen recording: in Settings, opening Privacy and tapping Download my data, which saves everything Budgeer holds about you as one file.',
        },
      },
      {
        id: 'privacy-requests',
        q: 'Who do I contact about my privacy?',
        a: [
          `Email ${PRIVACY_EMAIL}, or use the request form in Settings → Privacy. We answer within one month. Budgeer is operated from Belgium; if you’re not happy with our answer, you can complain to the Belgian Data Protection Authority.`,
          'The Privacy Notice explains in detail what we store, why, who receives it and how long we keep it.',
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    items: [
      {
        id: 'old-data',
        q: 'The app shows old data. What do I do?',
        a: [
          'Budgeer updates itself automatically, and changes from your other devices and your groups appear on their own while you’re online. If something still looks out of date, check that you’re online — an “Offline” label shows when you’re not — then close and reopen the app.',
        ],
      },
      {
        id: 'offline-use',
        q: 'Does Budgeer work offline?',
        a: [
          'Partly. Offline you can open the app and see recently loaded data. Adding or changing anything needs a connection.',
        ],
      },
      {
        id: 'no-notifications',
        q: 'I don’t get notifications.',
        a: [
          'Check that push is on in Settings → Notifications, and that your browser or phone allows notifications for Budgeer. On an iPhone, push only works once Budgeer is installed on your home screen. Notifications are turned on separately on each device.',
        ],
      },
      {
        id: 'import-not-recognised',
        q: 'Import didn’t recognise my bank.',
        a: [
          'You can still import the file: tell Budgeer which columns hold the date, amount and description, and the rest is the same. The file needs a header row and must be under 5 MB.',
        ],
      },
      {
        id: 'contact-support',
        q: 'My question isn’t answered here. How do I get help?',
        a: [
          `Email ${SUPPORT_EMAIL} with what you were doing, what you expected and what happened (a screenshot helps — blank out any amounts or names you’d rather not share). Budgeer is a hobby project, so replies may take a few days. For requests about your personal data, use ${PRIVACY_EMAIL} instead.`,
        ],
      },
    ],
  },
]
