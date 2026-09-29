import ConfirmDialog from './ConfirmDialog.jsx'
import { formatMoney } from '../lib/currency.js'
import { useT } from '../lib/i18n/I18nProvider.jsx'
import { entryName } from '../lib/categoryName.js'

// "Delete this expense?" — the confirm step before deleting one transaction
// (the list's row action, the transaction page, a group expense, a savings
// move). Open while `row` is set; `note` adds a line (e.g. that its rule
// keeps repeating).
export default function DeleteTransactionDialog({ row, onClose, onConfirm, busy, note }) {
  const t = useT('transactions')
  const kind = row?.kind === 'income' ? 'income' : 'expense'
  return (
    <ConfirmDialog isOpen={!!row} onClose={onClose} onConfirm={onConfirm} busy={busy} danger
      title={t(`deleteDialog.title.${kind}`)} confirmLabel={t('common:actions.delete')}
      body={row && (
        <>
          {t('deleteDialog.body', {
            name: entryName(row, t('deleteDialog.thisEntry')),
            amount: formatMoney(row.amount_minor, row.currency),
          })}
          {note && ` ${note}`}
        </>
      )} />
  )
}
