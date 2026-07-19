import { useState } from 'react'
import {
  Heading, Stack, Card, CardBody, HStack, Button, FormControl, FormLabel,
  Input, Text, useToast, SimpleGrid,
} from '@chakra-ui/react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { monthRange } from '../lib/useData.js'

// Calls the `generate-report` edge function, which builds a full financial
// statement server-side and returns a file blob (xlsx or pdf).
export default function Reports() {
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
      // supabase-js returns a Blob for non-JSON responses.
      const blob = data instanceof Blob ? data : new Blob([JSON.stringify(data)])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `financial-statement_${from}_${to}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast({
        title: 'Could not generate report',
        description: e.message + ' — is the generate-report edge function deployed?',
        status: 'error',
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Stack spacing={5}>
      <Heading size="lg">Reports</Heading>

      <Card><CardBody>
        <Text color="text.muted" mb={4}>
          Generate a full financial statement — summary, transactions, income vs.
          expense, budget performance, and category breakdown — for a date range.
        </Text>
        <HStack align="end" spacing={3} mb={5}>
          <FormControl>
            <FormLabel>From</FormLabel>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormControl>
          <FormControl>
            <FormLabel>To</FormLabel>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormControl>
        </HStack>
        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
          <Button leftIcon={<FileSpreadsheet size={18} />} onClick={() => generate('xlsx')}
            isLoading={busy === 'xlsx'} loadingText="Building…">
            Export Excel
          </Button>
          <Button leftIcon={<FileText size={18} />} onClick={() => generate('pdf')}
            isLoading={busy === 'pdf'} loadingText="Building…" variant="outline">
            Export PDF
          </Button>
        </SimpleGrid>
      </CardBody></Card>
    </Stack>
  )
}
