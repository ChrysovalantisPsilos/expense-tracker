// The statement import's words (the import namespace), pure: what the page
// and the native app say about the file, the detected layout, the preview's
// rows and what was left out, and the done step. Every sentence is built
// here once, so the two can't word it differently.
import { intlLocale, t } from '../../shared/lib/i18n/i18n.js'
import { shortDate } from '../../shared/lib/dates.js'
import { formatSigned } from '../../shared/lib/currency.js'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { importFileProblem } from './sheetParse.js'
import { PRESET_NAMES, mappingUnsure } from './statementDetect.js'
import { displayDescription } from './kbcLabels.js'

// The upload step's longer note: any sheet with a header row, the banks
// recognised by name, the preview, what's left out and the ECB rates.
export const uploadMore = () => t('import:upload.more', { banks: PRESET_NAMES.join(', ') })

// A row's error code (importMath.rowToDraft) in words: import:reasons.*.
export function reasonText(reason) {
  if (reason === 'missing/invalid date') return t('import:reasons.date')
  if (reason === 'missing/invalid amount') return t('import:reasons.amount')
  const currency = /^unsupported currency (.*)$/.exec(reason)
  return currency ? t('import:reasons.currency', { code: currency[1] }) : reason
}

// Why a chosen file can't be imported before reading it ({ name, size }), or null.
export const fileProblem = (file) =>
  importFileProblem(file, { tr: (key, vars) => t(`import:${key}`, vars), locale: intlLocale('en-US') })

// Why a file couldn't be read: the reader's message key (sheetParse's
// errors.*), or none for an unexpected failure.
export const readProblem = (key) => (key
  ? t(`import:${key}`, { hint: t('import:errors.exportHint') })
  : t('import:errors.unreadableShort'))

// The mapping step's line about the layout (statementDetect.detectMapping's
// `detection`): remembered, a bank recognised, detected or unsure; then
// "Check the preview".
export function detectionText(detection) {
  const said = detection.remembered
    ? t('import:map.remembered')
    : detection.preset
      ? t('import:map.recognised', { bank: detection.preset.name })
      : t(mappingUnsure(detection) ? 'import:map.unsure' : 'import:map.detected')
  return `${said} ${t('import:map.checkPreview')}`
}

// One preview row as it's shown: its text, its day and category, its signed
// amount, and whether it is money in. `category` is the row's (or null);
// `now` decides whether a day needs its year (dates.shortDate).
export function previewRow(draft, category, now = new Date()) {
  const day = shortDate(draft.spent_at, now)
  return {
    title: displayDescription(draft) || '—',
    meta: category ? `${day} · ${categoryDisplayName(category)}` : day,
    amount: formatSigned(draft.amount_minor, draft.currency, { plus: draft.kind === 'income' }),
    income: draft.kind === 'income',
  }
}

// The line under the preview (statementRows.statementPreview's counts): own
// transfers and other lines left out, rows that can't be read with the first
// one's line and reason; null when every row is ready. `lines` are the rows'
// file line numbers.
export function previewNote(preview, lines) {
  const parts = []
  if (preview.ownTransfers > 0) parts.push(t('import:preview.ownTransfers', { count: preview.ownTransfers }))
  if (preview.skipped > 0) parts.push(t('import:preview.skipped', { count: preview.skipped }))
  if (preview.errors > 0) {
    parts.push(t('import:preview.errors', {
      count: preview.errors, line: lines[preview.firstError.index], reason: reasonText(preview.firstError.reason),
    }))
  }
  return parts.length ? parts.join(' ') : null
}

// The done step's words (statementRows.importSummary): the title, the dates
// the entries have (or null; `now` as for previewRow), then a note each for
// what was skipped.
export function doneText(result, now = new Date()) {
  const notes = []
  if (result.duplicates > 0) notes.push(t('import:done.duplicates', { count: result.duplicates }))
  if (result.failed > 0) {
    notes.push(result.errors.length
      ? t('import:done.failedExample', {
        count: result.failed, line: result.errors[0].row, reason: reasonText(result.errors[0].reason),
      })
      : t('import:done.failed', { count: result.failed }))
  }
  if (result.ownTransfers > 0) notes.push(t('import:done.ownTransfers', { count: result.ownTransfers }))
  if (result.ignored > 0) notes.push(t('import:done.ignored', { count: result.ignored }))
  return {
    title: t('import:done.title', { count: result.inserted }),
    dated: result.range ? t('import:done.dated', { from: shortDate(result.range.from, now), to: shortDate(result.range.to, now) }) : null,
    notes,
  }
}
