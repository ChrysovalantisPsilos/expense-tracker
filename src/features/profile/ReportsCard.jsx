import { useState } from 'react'
import {
  Card, CardBody, Heading, HStack, Button, FormControl, FormLabel,
  Input, Text, useToast, SimpleGrid,
} from '@chakra-ui/react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase.js'
import { monthRange } from '../transactions/useData.js'

// Financial-statement export (PDF/Excel) — lives on the Profile page. Calls the
// `generate-report` edge function, which builds the statement server-side and
// returns a file blob.
export default function ReportsCard() {
  const { from: mFrom, to: mTo } = monthRange()
  const [from, setFrom] = useState(mFrom)
  const [to, setTo] = useState(mTo)
  const [busy, setBusy] = useState(null) // 'xlsx' | 'pdf' | null
  const toast = useToast()

  async function generate(format) {
    setBusy(format)
    try {
      const { data, error } = await supabase.functions.invoke('generate-report', {
        body: { from, to, format },
      })
      if (error) throw error
      const blob = data instanceof Blob ? data : new Blob([JSON.stringify(data)])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `financial-statement_${from}_${to}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast({ title: 'Could not generate report', description: e.message, status: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card><CardBody>
      <Heading size="sm" mb={1}>Export statement</Heading>
      <Text color="text.muted" fontSize="sm" mb={4}>
        A full financial statement — summary, transactions, income vs. expenses
        and category breakdown — for a date range.
      </Text>
      <HStack align="end" spacing={3} mb={4}>
        <FormControl>
          <FormLabel fontSize="sm">From</FormLabel>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm">To</FormLabel>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormControl>
      </HStack>
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
        <Button leftIcon={<FileText size={18} />} onClick={() => generate('pdf')}
          isLoading={busy === 'pdf'} loadingText="Building…">
          Export PDF
        </Button>
        <Button leftIcon={<FileSpreadsheet size={18} />} onClick={() => generate('xlsx')}
          isLoading={busy === 'xlsx'} loadingText="Building…" variant="outline">
          Export Excel
        </Button>
      </SimpleGrid>
    </CardBody></Card>
  )
}
