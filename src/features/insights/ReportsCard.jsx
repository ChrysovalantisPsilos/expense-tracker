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
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Financial-statement export (PDF/Excel) for a date range, on the Insights page.
// `noEntries`: nothing has been logged yet, so the buttons are off with a hint.
export default function ReportsCard({ noEntries = false }) {
  const { from: mFrom, to: mTo } = monthRange()
  const [from, setFrom] = useState(mFrom)
  const [to, setTo] = useState(mTo)
  const [busy, setBusy] = useState(null) // 'xlsx' | 'pdf' | null
  const toast = useToast()
  const t = useT('insights')

  async function generate(format) {
    setBusy(format)
    try {
      await downloadStatement({ from, to, format })
    } catch (e) {
      console.error('[insights] report failed:', e)
      toast({ title: t('reports.failed'), description: userMessage(e), status: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel title={t('reports.title')}>
      <Text color="text.muted" fontSize="sm" mb={4} mt={-1}>{t('reports.lead')}</Text>
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3} mb={4}>
        <FormControl>
          <FormLabel fontSize="sm">{t('reports.from')}</FormLabel>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm">{t('reports.to')}</FormLabel>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormControl>
      </SimpleGrid>
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
        <Button leftIcon={<FileText size={18} />} onClick={() => generate('pdf')}
          isLoading={busy === 'pdf'} isDisabled={busy !== null || noEntries} loadingText={t('reports.building')} spinner={<RingSpinner />}>
          {t('reports.pdf')}
        </Button>
        <Button leftIcon={<FileSpreadsheet size={18} />} onClick={() => generate('xlsx')}
          isLoading={busy === 'xlsx'} isDisabled={busy !== null || noEntries} loadingText={t('reports.building')} spinner={<RingSpinner />}
          variant="outline">
          {t('reports.excel')}
        </Button>
      </SimpleGrid>
      {noEntries && (
        <Text fontSize="sm" color="text.muted" mt={3}>
          {t('reports.noEntries')}
        </Text>
      )}
      {busy && <BusyNote mt={4}>{t(busy === 'pdf' ? 'reports.preparingPdf' : 'reports.preparingExcel')}</BusyNote>}
    </Panel>
  )
}
