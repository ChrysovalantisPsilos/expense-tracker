import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Text, useToast } from '@chakra-ui/react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { deleteSharedExpense } from './groups.js'
import GroupFormPage from './GroupFormPage.jsx'
import GroupExpenseForm from './GroupExpenseForm.jsx'
import { rememberGroup } from './myGroups.js'
import DeleteTransactionDialog from '../../shared/ui/DeleteTransactionDialog.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// A group expense's page:
//   /groups/:id/expenses/new          add one (you're the payer to start)
//   /groups/:id/expenses/:expenseId   edit one — its creator or the owner
// Saving or deleting goes back to wherever the user came from, else the group.
// Adding one also moves the group to the front of the Add form's "Who's it
// for?" row (rememberGroup).
export default function GroupExpensePage() {
  const { expenseId } = useParams()
  const t = useT('groups')
  return (
    <GroupFormPage title={t(expenseId ? 'expensePage.titleEdit' : 'expensePage.titleAdd')}>
      {(ctx) => <ExpenseBody key={expenseId ?? 'new'} ctx={ctx} expenseId={expenseId} />}
    </GroupFormPage>
  )
}

function ExpenseBody({ ctx, expenseId }) {
  const { group, members, expenses, myMember, isOwner, groupPath } = ctx
  const back = useGoBack(groupPath)
  const toast = useToast()
  const t = useT('groups')
  const [confirming, setConfirming] = useState(false)
  const { busy: deleting, run } = useAsyncSubmit()
  const expense = expenseId ? expenses.find((e) => e.id === expenseId) ?? null : null

  const note = (text) => <Panel><Text color="text.muted">{text}</Text></Panel>
  if (!myMember) return note(t('expensePage.onlyMembers'))
  if (expenseId && !expense) return note(t('expensePage.gone'))
  if (expense && expense.created_by !== myMember.user_id && !isOwner) {
    return note(t('expensePage.onlyCreator'))
  }

  async function remove() {
    await run(async () => {
      await deleteSharedExpense(expense.id)
      toast({ title: t('expensePage.deleted'), status: 'success' })
      setConfirming(false)
      back()
    })
  }

  return (
    <>
      <GroupExpenseForm group={group} members={members} myMemberId={myMember.id}
        defaultPayer={myMember.id} expense={expense}
        onSaved={() => { if (!expense) rememberGroup(group.id); back() }}
        onDelete={expense ? () => setConfirming(true) : undefined} />
      <DeleteTransactionDialog row={confirming ? expense : null} onClose={() => setConfirming(false)}
        onConfirm={remove} busy={deleting}
        note={t('expensePage.deleteNote')} />
    </>
  )
}
