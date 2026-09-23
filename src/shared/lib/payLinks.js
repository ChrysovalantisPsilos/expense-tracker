// Pure builders for the settle-up payment links (no I/O) — unit-tested in
// test/payLinks.test.js.
import { minorFactor } from './currency.js'

// A Revolut.me link that opens the payee's page with the amount filled in.
// revolut.me reads `?currency=EUR&amount=1250`, the amount in MINOR units
// (cents), as its own request-money page does (it parses the value with
// parseInt, 1–99,999,999,999). A currency Revolut doesn't offer on that page
// just shows the payee without an amount.
export function revolutUrl(tag, amountMinor, currency) {
  const handle = String(tag ?? '').trim().replace(/^@/, '')
  if (!handle) return null
  const base = `https://revolut.me/${encodeURIComponent(handle)}`
  const amount = Math.round(Number(amountMinor))
  return amount > 0 && /^[A-Z]{3}$/.test(currency ?? '')
    ? `${base}?currency=${currency}&amount=${amount}`
    : base
}

// A PayPal.me name as people paste it ("paypal.me/Name", "@Name",
// "https://www.paypal.me/Name/10") → "Name", or null if it isn't one
// (PayPal.me names are 1–20 letters and numbers; the server checks the same).
export function normalisePaypalHandle(raw) {
  const s = String(raw ?? '').trim()
    .replace(/^https?:\/\//i, '').replace(/^(www\.)?paypal\.me\//i, '').replace(/^@/, '')
    .split(/[/?#]/)[0]
  return /^[A-Za-z0-9]{1,20}$/.test(s) ? s : null
}

// PayPal.me's documented format: paypal.me/<name>/<amount><CURRENCY>, the
// amount in major units with a dot ("12.50EUR", "1800JPY").
export function paypalUrl(handle, amountMinor, currency) {
  const name = normalisePaypalHandle(handle)
  if (!name) return null
  const base = `https://paypal.me/${name}`
  const amount = Math.round(Number(amountMinor))
  if (!(amount > 0) || !/^[A-Z]{3}$/.test(currency ?? '')) return base
  const digits = Math.log10(minorFactor(currency))
  return `${base}/${(amount / minorFactor(currency)).toFixed(digits)}${currency}`
}
