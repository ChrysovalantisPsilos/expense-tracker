// Namespace `notifications`: src/features/notifications (the bell and the
// push prompt). The notifications' own titles and bodies are written by the
// server, in English for now (docs/I18N.md, "Server texts").
export default {
  bell: {
    title: 'Notifications',
    labelUnread_one: 'Notifications, {{count}} unread',
    labelUnread_other: 'Notifications, {{count}} unread',
    empty: 'You’re all caught up.',
    viewInvites: 'View invites',
    // QueryError's "Couldn't load …".
    what: 'notifications',
  },
  prompt: {
    title: 'Turn on notifications?',
    body: 'Get a heads-up when friends add expenses or invite you to a group, and reminders before your bills are due. You can change this anytime in Settings → Notifications.',
    emailToo: 'Also email me about big events — invites, members joining or leaving',
    notNow: 'Not now',
    enable: 'Enable',
    on: {
      title: 'Notifications on',
      body: 'You’ll get group activity and payment reminders on this device.',
    },
    blocked: {
      title: 'Notifications blocked',
      body: 'You can allow them in your browser settings anytime.',
    },
    unsupported: {
      title: 'Push isn’t available in this browser',
      body: 'On iPhone, install Budgeer to your home screen first.',
    },
    failed: 'Couldn’t enable notifications on this device',
  },
}
