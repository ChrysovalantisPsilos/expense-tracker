import { intlLocale } from '../lib/i18n/i18n.js'

// Y-axis tick label for the money charts (major units): "800", "1.6k", "2.4k",
// "120k", "1.5M". One decimal keeps neighbouring ticks distinct, where whole
// thousands would print 1.6k and 2.4k both as "2k".
// Greek: "1,6 χιλ.", "1,5 εκ.".
export const axisTick = (v) =>
  new Intl.NumberFormat(intlLocale('en'), { notation: 'compact', maximumFractionDigits: 1 }).format(v).replace(/K$/, 'k')
