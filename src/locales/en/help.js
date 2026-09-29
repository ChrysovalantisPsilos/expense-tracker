// Namespace `help`: the Help & FAQ page and its install guide (src/features/help).
//
// The FAQ lives under `faq`: `faq.sections.<id>` are the section titles and
// `faq.items.<id>` the questions, where <id> is the question's #anchor in
// camelCase (install-iphone → installIphone). Each item has `q`, the answer's
// paragraphs `a.p1…`, optional numbered `steps.s1…` and a clip's `clip`
// description. faqContent.js holds the anchors, order and media, and reads
// the paragraphs and steps in the order this file lists them.
export default {
  eyebrow: 'Help',
  title: 'Help & FAQ',
  publicTitle: 'Frequently asked questions',
  intro: 'Answers to the questions people ask most. Search, or browse by topic.',
  search: {
    label: 'Search questions',
    clear: 'Clear search',
    found_one: '{{count}} answer found',
    found_other: '{{count}} answers found',
    none: 'No answers match “{{query}}”.',
    noneHint: 'Try other words, or browse all the questions.',
    showAll: 'Show all questions',
  },
  copyLink: 'Copy link to this answer',
  linkCopied: 'Link copied',
  linkInAddressBar: 'The link is in the address bar',
  // {{disclaimer}} is the shared hobby-project line (common:hobby.disclaimer).
  seeAlso: '{{disclaimer}} See also the <link>Privacy page</link>.',
  status: 'Something not working? Check the <link>service status</link>.',
  clip: {
    play: 'Play the clip',
    pause: 'Pause the clip',
  },
  // The install sketches: simplified drawings of each browser's controls, so
  // the menu labels follow what the browser shows in this language.
  install: {
    iphone: {
      label: 'Safari on an iPhone: tap the Share button in the bottom toolbar, then Add to Home Screen in the list that opens.',
      copy: 'Copy',
      favourites: 'Add to Favourites',
      addToHome: 'Add to Home Screen',
      step1: 'Tap Share',
      step2: 'Add to Home Screen',
    },
    android: {
      label: 'Chrome on Android: tap the three-dot menu at the top right, then Install app.',
      newTab: 'New tab',
      history: 'History',
      installApp: 'Install app',
      step1: 'Tap ⋮',
      step2: 'Install app',
    },
    samsung: {
      label: 'Samsung Internet: tap the menu at the bottom right, then Add page to, Home screen.',
      addPageTo: 'Add page to',
      bookmarks: 'Bookmarks',
      homeScreen: 'Home screen',
      step1: 'Tap the menu',
      step2: 'Add page to → Home screen',
    },
    desktop: {
      label: 'Chrome or Edge on a computer: click the install icon at the right of the address bar, then Install.',
      prompt: 'Install app?',
      install: 'Install',
      step1: 'Click the install icon',
      step2: 'Install',
    },
  },
  faq: {
    sections: {
      gettingStarted: 'Getting started',
      install: 'Install Budgeer on your phone',
      expensesIncome: 'Expenses & income',
      subscriptionsRecurring: 'Subscriptions & recurring',
      budgetsCategories: 'Budgets & categories',
      groupsSplitting: 'Groups & splitting',
      currencies: 'Currencies',
      importReceipts: 'Import & receipts',
      reportsBackups: 'Reports & backups',
      accountSecurity: 'Account & security',
      privacyData: 'Privacy & data',
      troubleshooting: 'Troubleshooting',
    },
    items: {
      whatIsBudgeer: {
        q: 'What is Budgeer?',
        a: {
          p1: 'Budgeer is an expense tracker and bill splitter. Log what you spend and earn, set monthly budgets, keep an eye on subscriptions, and split costs with friends in groups.',
          p2: 'It runs in your browser and can be installed like an app on your phone or computer.',
        },
      },
      isItFree: {
        q: 'Does Budgeer cost anything?',
        a: {
          p1: 'No. Budgeer is free, with no limits on how much you track and no ads.',
        },
      },
      comparedToOthers: {
        q: 'How is Budgeer different?',
        a: {
          p1: 'Most money apps do one of two things: bill splitters look after shared costs with friends, and budgeting apps look after your own money. Budgeer does both in one place.',
          p2: 'Your budget and your groups in one app. Track your own spending against monthly budgets and split costs with friends in the same place. Your share of a group expense lands in your own spending automatically, converted at the European Central Bank rate for the day.',
          p3: 'Free, with no daily cap and no ads. Every feature is free. There’s no daily limit on how many expenses you add — only hourly safety limits against abuse — and no ads or analytics trackers.',
          p4: 'Private by default. Your data is stored in the EU (Paris). Amounts and descriptions are encrypted at rest on the server — that’s not end-to-end encryption. Receipts are read on your device and never uploaded.',
          p5: 'Where others are better: Budgeer has no live bank connection — you import CSV or Excel statements instead. It isn’t in the App Store or Google Play; you install it from your browser. And it’s a one-person hobby project, so it has less polish than long-established apps, and support replies can take a few days.',
        },
      },
      financialAdvice: {
        q: 'Is Budgeer a financial service? Does it give financial advice?',
        a: {
          p1: 'No. Budgeer is a free hobby project, built and run by one person in their spare time. It isn’t a bank, a payment service, a financial adviser or any other regulated financial service: it never holds, moves or collects money, and it can’t see your bank accounts. It’s a tool for recording and organising the numbers you enter yourself.',
          p2: 'It doesn’t give financial, investment, tax or legal advice, and nothing in it is a recommendation to do anything with your money. Its figures — including exchange rates, projections, budget alerts, spread-out subscriptions, balances, imports and receipt scans — may contain mistakes. It’s provided as is, without guarantees, so check important numbers against your bank statements, and ask a qualified professional when you need advice.',
          p3: 'The decisions you make with it, and settling up with friends, are up to you. The Terms of Use set this out in full.',
        },
      },
      whoRunsBudgeer: {
        q: 'Who runs Budgeer?',
        a: {
          p1: 'One person, in their spare time, from Belgium. There’s no company or support team behind it, and it’s free because it’s a hobby. It’s looked after with care, but it can have bugs or downtime, features can change, and support replies may take a few days.',
          p2: 'If Budgeer ever has to close, you’ll be told in advance where possible, with time to download your data.',
          p3: 'For help or to report a problem, email {{supportEmail}}; for anything about your personal data, email {{privacyEmail}}.',
        },
      },
      signInOptions: {
        q: 'How can I log in?',
        a: {
          p1: 'With your email address and a password, with “Sign in with Google”, or with a passkey once you’ve added one on your device.',
        },
      },
      appTour: {
        q: 'Can I see the app tour again?',
        a: {
          p1: 'Yes. Go to Settings → Help → Take the tour again.',
        },
      },
      installApp: {
        q: 'Can I install Budgeer like an app?',
        a: {
          p1: 'Yes. Budgeer is a web app: you install it straight from your browser, not from the App Store or Google Play. It’s free and takes a few seconds.',
          p2: 'Pick your device below. Once installed, Budgeer opens from its own icon, full screen, like any other app.',
        },
      },
      installIphone: {
        q: 'How do I install it on an iPhone or iPad?',
        a: {
          p1: 'Use Safari:',
        },
        steps: {
          s1: 'Open www.budgeer.com in Safari.',
          s2: 'Tap the Share button — the square with an arrow pointing up. It’s at the bottom of the screen on an iPhone (tap ⋯ first if you don’t see it) and at the top right on an iPad.',
          s3: 'Scroll down the list and tap Add to Home Screen.',
          s4: 'Tap Add. Budgeer’s icon appears on your home screen.',
        },
      },
      installAndroid: {
        q: 'How do I install it on an Android phone?',
        a: {
          p1: 'Use Chrome:',
        },
        steps: {
          s1: 'Open www.budgeer.com in Chrome.',
          s2: 'Tap the ⋮ menu at the top right.',
          s3: 'Tap Install app (on some phones it says Add to Home screen, then Install).',
          s4: 'Confirm with Install. Budgeer’s icon appears with your other apps.',
        },
      },
      installSamsung: {
        q: 'How do I install it with Samsung Internet?',
        a: {
          p1: 'On a Samsung phone’s own browser:',
        },
        steps: {
          s1: 'Open www.budgeer.com in Samsung Internet.',
          s2: 'Tap the menu (three lines) at the bottom right.',
          s3: 'Tap Add page to, then Home screen. If the address bar shows an install icon, you can tap that instead.',
          s4: 'Tap Add. Budgeer’s icon appears on your home screen.',
        },
      },
      installDesktop: {
        q: 'Can I install it on my computer?',
        a: {
          p1: 'Yes, in Chrome or Edge:',
        },
        steps: {
          s1: 'Open www.budgeer.com.',
          s2: 'Click the install icon at the right of the address bar (a screen with an arrow).',
          s3: 'Click Install. Budgeer opens in its own window and can be pinned to your taskbar or dock.',
        },
      },
      installBenefits: {
        q: 'What changes once it’s installed?',
        a: {
          p1: 'It opens from its own icon, full screen, without the browser’s address bar.',
          p2: 'It opens even offline and shows your recently loaded data; adding or changing anything still needs a connection.',
          p3: 'On an iPhone or iPad, notifications only work once Budgeer is installed on your home screen. On Android and computers they work in the browser too.',
          p4: 'It updates itself automatically — there’s nothing to download from a store. Your data lives in your account, not on the phone, so removing the app later doesn’t delete anything.',
        },
      },
      addExpense: {
        q: 'How do I add an expense or income?',
        a: {
          p1: 'Open Transactions and tap Add. Enter the amount, currency, date, category and a description, plus notes if you like, then save. Tapping an entry later opens the same page so you can edit it.',
          p2: 'To make it repeat, fill in the Repeat section on the same page (see “How do I make an expense repeat?”).',
        },
      },
      findTransaction: {
        q: 'How do I find an old transaction?',
        a: {
          p1: 'Use the search box on the Transactions page, or the filters next to it (category, amount range and dates). With no search it shows this month; searching looks through all your history.',
        },
      },
      categoryPage: {
        q: 'How do I see everything I spent in one category?',
        a: {
          p1: 'Tap the category on Home, or its budget on the Budgets page. That opens the category’s page with its expenses, and you can edit them right there.',
        },
      },
      makeRecurring: {
        q: 'How do I make an expense repeat?',
        a: {
          p1: 'When you add or edit an expense, use its Repeat section: choose weekly, monthly, quarterly or yearly, and how often (every 1, 2, 3… of those). Then set the next date, an optional end date, and an optional reminder a few days before it’s due.',
        },
        clip: 'Screen recording: on the new expense page, entering 12.99 for a gym membership, switching on Repeat — monthly by default, with the next charge date filled in — then saving it.',
      },
      recurringPage: {
        q: 'Where do I see my subscriptions and regular income?',
        a: {
          p1: 'On the Recurring page (under More on a phone). The Subscriptions tab lists what you pay regularly; the Income tab lists money that comes in regularly, such as a salary.',
          p2: 'Home also has a Recurring card with tabs for each frequency, so you can see what your weekly, monthly or yearly payments add up to.',
        },
      },
      yearlySubscriptions: {
        q: 'How do yearly subscriptions count in my monthly spending?',
        a: {
          p1: 'By default a yearly payment is spread evenly over the 12 months it covers, so a €120 subscription counts as €10 a month in your totals and budgets.',
          p2: 'If you’d rather keep them separate, turn that off in Settings → Monthly spending. Yearly subscriptions then stay out of your monthly totals and budgets and are shown in their own card on Home.',
        },
        clip: 'Screen recording: adding a car insurance of 480 euros that repeats yearly; the form shows it counts as 40 euros a month in budgets. Then Home’s Recurring card is switched to its Yearly tab.',
      },
      salaryNextMonth: {
        q: 'My salary arrives at the end of the month for the next one. Can it count for the next month?',
        a: {
          p1: 'Yes. In Settings → Monthly spending, turn on “Count salary paid late in the month toward the next month”, pick the day it starts from (the 25th by default; in shorter months a late day means their last day) and which income category is your salary.',
          p2: 'Salary paid from that day to the month’s end then counts for the next month in your totals on Home, in Insights and in the statement: a salary paid on 30 September counts for October. Salary paid earlier in the month stays in its own month.',
          p3: 'Lists keep the real payment date and mark the entry “Counts for October”. Budgets only look at spending, so they don’t change.',
        },
      },
      paymentReminders: {
        q: 'Can Budgeer remind me before a bill is due?',
        a: {
          p1: 'Yes. Set a reminder in the Repeat section and you’ll get a notification that many days before the payment is due.',
        },
      },
      budgetsHow: {
        q: 'How do budgets work?',
        a: {
          p1: 'Set a monthly limit for a category on the Budgets page. A budget carries on from month to month until you delete it, so you only set it up once.',
          p2: 'You’ll get a notification when a category is nearly at its budget and when it goes over. Tap a budget to see its expenses and edit it.',
        },
        clip: 'Screen recording: on the Budgets page, tapping the Food & Dining budget opens the category’s page with its budget and expenses; tapping Edit, the monthly budget is changed to 300 euros and saved.',
      },
      manageCategories: {
        q: 'Can I change the categories?',
        a: {
          p1: 'Yes. In Settings → Categories you can add, rename, recolour or archive categories.',
        },
      },
      inviteFriends: {
        q: 'How do I invite friends to a group?',
        a: {
          p1: 'Open the group and tap its members, then Copy link under Invite people, or Email to send an invite by email. A link works for at most 24 hours, so share it only with people you want in the group.',
          p2: 'Friends without an account can create one for free from the link and join straight away.',
        },
        clip: 'Screen recording: opening the Lisbon weekend group, tapping its members, and tapping Copy link under Invite people; the invite link is copied, ready to paste into a chat.',
      },
      splitOptions: {
        q: 'How can I split an expense?',
        a: {
          p1: 'Equally, by exact amounts, by percentages, or by shares (for example 2 shares for a couple and 1 for a single person). Each expense can be in its own currency, and Budgeer converts it for the group’s balances.',
        },
      },
      settleUp: {
        q: 'How do we settle up?',
        a: {
          p1: 'Tap Settle up in the group. Budgeer suggests the fewest payments that clear everyone’s balance. If the person you’re paying has added payment details, you’ll see their IBAN, or a Revolut or PayPal link that opens with the amount filled in. Record the payment in Budgeer once it’s sent.',
          p2: 'You can add your own details in Settings → Account → Getting paid.',
        },
        clip: 'Screen recording: in the Lisbon weekend group, the balances show who is owed; Who owes whom lists the fewest payments that clear everyone, and Settle up fills in a suggested payment to record once it’s paid.',
      },
      groupReminders: {
        q: 'Can I remind someone who owes me?',
        a: {
          p1: 'Yes. When settling up, you can send a friendly reminder to a member who owes money. They get a notification — no amounts are included.',
        },
      },
      foreignCurrency: {
        q: 'Can I add expenses in another currency?',
        a: {
          p1: 'Yes. Pick the currency you paid in, and Budgeer converts it to your main currency at the European Central Bank’s reference rate for that day. Each expense keeps its rate, so past totals don’t shift later.',
          p2: 'The ECB publishes rates on working days, in the afternoon. Until that day’s rate is out, the conversion shows as pending and is filled in automatically once it’s available.',
        },
      },
      mainCurrency: {
        q: 'How do I change my main currency?',
        a: {
          p1: 'In Settings → Account → Default currency, until you add your first entry. After that it’s fixed, because every entry’s exchange rate is to that currency — so past amounts stay correct.',
          p2: 'To start over in another currency, export your data (Settings → Your data) and create a new account.',
        },
      },
      bankImport: {
        q: 'Can I import my bank statement?',
        a: {
          p1: 'Yes. On Transactions, open the ⋯ menu and choose Import. Upload a CSV or Excel file exported from your bank. Budgeer recognises exports from BNP Paribas Fortis, ING, KBC, Crelan, Piraeus, Alpha Bank, Eurobank (Hellenic) and Revolut automatically.',
          p2: 'The file is read on your device, and only the transactions you import are saved. Importing the same file twice doesn’t create duplicates.',
        },
        clip: 'Screen recording: on the Import page, choosing a CSV bank statement; Budgeer recognises the columns and shows a preview of the transactions before importing them.',
      },
      receiptScan: {
        q: 'How does receipt scanning work?',
        a: {
          p1: 'When adding an expense, scan or pick a photo of a receipt, and Budgeer fills in the amount and date. It reads English and Greek receipts.',
          p2: 'The scan happens entirely on your device: the photo is never uploaded or stored. Always check the result before saving.',
        },
      },
      statements: {
        q: 'Can I get a statement of my spending?',
        a: {
          p1: 'Yes. On the Insights page, choose a date range and export it as a PDF or an Excel file.',
        },
      },
      backups: {
        q: 'How do I back up my data?',
        a: {
          p1: 'In Settings → Your data, download a backup file. You can protect it with a password; keep that password safe, because a protected file can’t be restored without it.',
          p2: 'Restoring merges the backup into your account and skips entries you already have. Your shares of group expenses come back as personal expenses.',
        },
      },
      passkeys: {
        q: 'What is a passkey?',
        a: {
          p1: 'A passkey lets you log in with your fingerprint, face or device PIN instead of a password. It’s saved and synced by your device’s password manager, such as iCloud Keychain, Google Password Manager or 1Password.',
          p2: 'Budgeer only stores the public half of the passkey, which can’t be used to log in on its own. Add one on each device you use, in Settings → Security.',
        },
      },
      passkeyReminder: {
        q: 'How do I stop the reminder to add a passkey?',
        a: {
          p1: 'Choose “Don’t remind me again” in the reminder. Your choice is saved to your account, so your other devices won’t ask either.',
        },
      },
      notifications: {
        q: 'What notifications does Budgeer send?',
        a: {
          p1: 'Push notifications for group activity, bill reminders and budget alerts, and emails for bigger events such as group invites. There’s also an optional weekly summary; new accounts need to turn it on.',
          p2: 'Notifications and emails say what happened, never the amounts or descriptions. Choose what you get in Settings → Notifications.',
          p3: 'A few emails about your account and your data are always sent, whatever those switches say: when the Privacy Notice or Terms change, when your account is deleted, when a copy of your data is downloaded or your notification choices change (so you’d notice if it wasn’t you), and a receipt when you send a privacy request. Replying to one reaches {{privacyEmail}}.',
        },
      },
      deleteAccount: {
        q: 'What happens if I delete my account?',
        a: {
          p1: 'Your account and personal records are permanently deleted (Settings → Security → Delete account lists exactly what goes). Expenses you shared in groups stay for the other members, so their balances still add up, but they show “Former member” instead of your name, with no link to you.',
          p2: 'Download your data (Settings → Privacy) or a backup (Settings → Your data) first if you might want it later.',
        },
      },
      encryption: {
        q: 'Is my data encrypted?',
        a: {
          p1: 'Yes, in two ways. Everything travels over encrypted (HTTPS) connections, and in the database your amounts, descriptions, notes and payment details are encrypted, with the key kept separately.',
          p2: 'This isn’t end-to-end encryption. Budgeer’s server can decrypt your data to show it to you and to the members of your groups. The encryption protects it if a copy of the database ever leaked.',
        },
      },
      adsTracking: {
        q: 'Do you show ads or track me?',
        a: {
          p1: 'No. There are no ads, no analytics or tracking scripts, and we don’t sell your data.',
        },
      },
      aiHelpers: {
        q: 'Does Budgeer use AI?',
        a: {
          p1: 'Only if you want it to. Settings → AI helpers has three optional helpers, each off until you turn it on: “Type to add” fills in a new entry from a line like “coffee 3.60 yesterday”, “Category ideas on import” suggests categories for merchants Budgeer hasn’t seen yet, and “Month in plain words” writes a short summary of your month on Insights and Home.',
          p2: 'They use Claude, by Anthropic. Each one sends only what it needs (never your name, email or bank details); Anthropic doesn’t train on it and deletes it within 30 days. Nothing is saved until you check it and tap Save or Import.',
        },
      },
      downloadDeleteData: {
        q: 'How do I download or delete my data?',
        a: {
          p1: 'Settings → Privacy → Download my data saves everything we hold about you as one file. To delete your account, go to Settings → Security → Delete account (Settings → Privacy links there too).',
        },
        clip: 'Screen recording: in Settings, opening Privacy and tapping Download my data, which saves everything Budgeer holds about you as one file.',
      },
      privacyRequests: {
        q: 'Who do I contact about my privacy?',
        a: {
          p1: 'Email {{privacyEmail}}, or use the request form in Settings → Privacy. We answer within one month. Budgeer is operated from Belgium; if you’re not happy with our answer, you can complain to the Belgian Data Protection Authority.',
          p2: 'The Privacy Notice explains in detail what we store, why, who receives it and how long we keep it.',
        },
      },
      oldData: {
        q: 'The app shows old data. What do I do?',
        a: {
          p1: 'Budgeer updates itself automatically, and changes from your other devices and your groups appear on their own while you’re online. If something still looks out of date, check that you’re online — an “Offline” label shows when you’re not — then close and reopen the app.',
        },
      },
      offlineUse: {
        q: 'Does Budgeer work offline?',
        a: {
          p1: 'Partly. Offline you can open the app and see recently loaded data. Adding or changing anything needs a connection.',
        },
      },
      noNotifications: {
        q: 'I don’t get notifications.',
        a: {
          p1: 'Check that push is on in Settings → Notifications, and that your browser or phone allows notifications for Budgeer. On an iPhone, push only works once Budgeer is installed on your home screen. Notifications are turned on separately on each device.',
        },
      },
      importNotRecognised: {
        q: 'Import didn’t recognise my bank.',
        a: {
          p1: 'You can still import the file: tell Budgeer which columns hold the date, amount and description, and the rest is the same. The file needs a header row and must be under 5 MB.',
        },
      },
      contactSupport: {
        q: 'My question isn’t answered here. How do I get help?',
        a: {
          p1: 'Email {{supportEmail}} with what you were doing, what you expected and what happened (a screenshot helps — blank out any amounts or names you’d rather not share). Budgeer is a hobby project, so replies may take a few days. For requests about your personal data, use {{privacyEmail}} instead.',
        },
      },
    },
  },
}
