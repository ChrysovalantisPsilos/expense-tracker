import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet } from 'lucide-react'
import { PageAction } from '../../shared/ui/PageHeader.jsx'
import LedgerPage from './LedgerPage.jsx'

export default function Expenses() {
  const navigate = useNavigate()
  return (
    <LedgerPage kind="expense" title="Expenses" addLabel="Add expense"
      emptyText="Nothing logged yet."
      extraAction={<PageAction variant="ghost" icon={<FileSpreadsheet size={16} />} label="Import"
        onClick={() => navigate('/import')} />} />
  )
}
