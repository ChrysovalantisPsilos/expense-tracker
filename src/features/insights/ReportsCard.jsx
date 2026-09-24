import { useState } from 'react'
import {
  Button, FormControl, FormLabel, Input, Text, useToast, SimpleGrid,
} from '@chakra-ui/react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { monthRange } from '../../shared/lib/dates.js'
import { downloadStatement } from './reports.js'
import { userMessage } from '../../shared/lib/errors.js'
import { BusyNote, RingSpinner } from '../../shared/ui/RingLoader.jsx'

// Financial-statement export (PDF/Excel) for a date range, on the Insights page.
export default function ReportsCard() {
  const { from: mFrom, to: mTo } = monthRange()
  const [from, setFrom] = useState(mFrom)
  const [to, setTo] = useState(mTo)
  const [busy, setBusy] = useState(null) // 'xlsx' | 'pdf' | null
  const toast = useToast()

  async function generate(format) {
    setBusy(format)
    try {
      await downloadStatement({ from, to, format })
    } catch (e) {
      console.error('[insights] report failed:', e)
      toast({ title: 'Could not generate report', description: userMessage(e), status: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel title="Export statement">
      <Text color="text.muted" fontSize="sm" mb={4} mt={-1}>
        A full financial statement — summary, transactions, income vs. expenses
        and category breakdown — for a date range.
      </Text>
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3} mb={4}>
        <FormControl>
          <FormLabel fontSize="sm">From</FormLabel>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm">To</FormLabel>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormControl>
      </SimpleGrid>
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
        <Button leftIcon={<FileText size={18} />} onClick={() => generate('pdf')}
          isLoading={busy === 'pdf'} isDisabled={busy !== null} loadingText="Building…" spinner={<RingSpinner />}>
          Export PDF
        </Button>
        <Button leftIcon={<FileSpreadsheet size={18} />} onClick={() => generate('xlsx')}
          isLoading={busy === 'xlsx'} isDisabled={busy !== null} loadingText="Building…" spinner={<RingSpinner />}
          variant="outline">
          Export Excel
        </Button>
      </SimpleGrid>
      {busy && <BusyNote mt={4}>Preparing your {busy === 'pdf' ? 'PDF' : 'Excel'} statement…</BusyNote>}
    </Panel>
  )
}
