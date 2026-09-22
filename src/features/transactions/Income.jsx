import LedgerPage from './LedgerPage.jsx'

export default function Income() {
  return (
    <LedgerPage kind="income" title="Income" addLabel="Add income"
      emptyText="No income logged yet." />
  )
}
