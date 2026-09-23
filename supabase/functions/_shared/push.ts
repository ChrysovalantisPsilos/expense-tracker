// Web-push delivery helpers for notify-user. No imports: the unit tests load
// this file directly.

// Browser push services only — the same allowlist save_push_subscription
// enforces in SQL (0058). Rows stored before 0058 may point anywhere, so the
// sender checks again rather than trusting the table.
const PUSH_HOST =
  /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/i

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try { url = new URL(endpoint) } catch { return false }
  return url.protocol === 'https:' && url.port === '' && !url.username && !url.password &&
    PUSH_HOST.test(url.hostname)
}

// Run `fn` over `items` with at most `limit` in flight; never rejects.
export async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]
      try { await fn(item) } catch { /* one bad endpoint must not stop the rest */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}
