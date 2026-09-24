import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Text, useToast } from '@chakra-ui/react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { deleteSharedExpense } from './groups.js'
import GroupFormPage from './GroupFormPage.jsx'
import GroupExpenseForm from './GroupExpenseForm.jsx'
import DeleteTransactionDialog from '../transactions/DeleteTransactionDialog.jsx'

// A group expense's page:
//   /groups/:id/expenses/new          add one (you're the payer to start)
//   /groups/:id/expenses/:expenseId   edit one — its creator or the owner
// Saving or deleting goes back to wherever the user came from, else the group.
export default function GroupExpensePage() {
  const { expenseId } = useParams()
  return (
    <GroupFormPage title={expenseId ? 'Edit expense' : 'Add shared expense'}>
      {(ctx) => <ExpenseBody key={expenseId ?? 'new'} ctx={ctx} expenseId={expenseId} />}
    </GroupFormPage>
  )
}

function ExpenseBody({ ctx, expenseId }) {
  const { group, members, expenses, myMember, isOwner, groupPath } = ctx
  const back = useGoBack(groupPath)
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const { busy: deleting, run } = useAsyncSubmit()
  const expense = expenseId ? expenses.find((e) => e.id === expenseId) ?? null : null

  const note = (text) => <Panel><Text color="text.muted">{text}</Text></Panel>
  if (!myMember) return note('Only the group’s members can add or edit its expenses.')
  if (expenseId && !expense) return note('This expense doesn’t exist any more.')
  if (expense && expense.created_by !== myMember.user_id && !isOwner) {
    return note('Only whoever added this expense, or the group’s owner, can edit it.')
  }

  async function remove() {
    await run(async () => {
      await deleteSharedExpense(expense.id)
      toast({ title: 'Expense deleted', status: 'success' })
      setConfirming(false)
      back()
    })
  }

  return (
    <>
      <GroupExpenseForm group={group} members={members} myMemberId={myMember.id}
        defaultPayer={myMember.id} expense={expense} onSaved={back}
        onDelete={expense ? () => setConfirming(true) : undefined} />
      <DeleteTransactionDialog row={confirming ? expense : null} onClose={() => setConfirming(false)}
        onConfirm={remove} busy={deleting}
        note="It comes off everyone’s balances and personal trackers." />
    </>
  )
}
