import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Heading, Stack, Card, CardBody, HStack, Text, Button, Box, Spacer, Select,
  FormControl, FormLabel, Table, Thead, Tbody, Tr, Th, Td, useToast,
  IconButton, Badge, TableContainer,
} from '@chakra-ui/react'
import { ArrowLeft, UploadCloud, FileSpreadsheet, Check } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useCategories } from '../transactions/useData.js'
import { useProfile } from '../../shared/lib/useProfile.js'
import { formatMoney, toMinor, CURRENCIES } from '../../shared/lib/currency.js'
import {
  IMPORT_FIELDS, parseWorkbook, guessMapping, buildTransactions, importTransactions,
} from './importExpenses.js'

export default function ImportExpenses() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { baseCurrency } = useProfile()
  const { categories } = useCategories('expense')

  const [step, setStep] = useState('upload') // upload | map | done
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { headers, rows } = await parseWorkbook(file)
      if (!rows.length) { toast({ title: 'That file has no rows', status: 'warning' }); return }
      setFileName(file.name)
      setHeaders(headers)
      setRows(rows)
      setMapping(guessMapping(headers))
      setStep('map')
    } catch (err) {
      toast({ title: 'Couldn’t read that file', description: err.message, status: 'error' })
    }
  }

  const previewTx = useMemoPreview(rows, mapping, user?.id, baseCurrency, categories)

  async function doImport() {
    if (!mapping.date || !mapping.amount) {
      toast({ title: 'Map both Date and Amount first', status: 'warning' }); return
    }
    setBusy(true)
    try {
      const { valid, errors } = await buildTransactions({
        rows, mapping, userId: user.id, baseCurrency, categories,
      })
      if (!valid.length) {
        toast({ title: 'Nothing to import', description: 'No rows had a valid date + amount.', status: 'warning' })
        setBusy(false); return
      }
      const inserted = await importTransactions(valid)
      setResult({ inserted, skipped: errors.length, errors: errors.slice(0, 10) })
      setStep('done')
    } catch (err) {
      toast({ title: 'Import failed', description: err.message, status: 'error' })
    } finally { setBusy(false) }
  }

  return (
    <Stack spacing={5} maxW="760px">
      <HStack>
        <IconButton aria-label="Back" variant="ghost" size="sm"
          icon={<ArrowLeft size={18} />} onClick={() => navigate('/expenses')} />
        <Heading size="lg">Import from Excel</Heading>
      </HStack>

      {step === 'upload' && (
        <Card><CardBody>
          <Stack spacing={4} align="center" py={8} textAlign="center">
            <Box color="accent.fg"><UploadCloud size={40} /></Box>
            <Text fontWeight="600">Upload a spreadsheet</Text>
            <Text fontSize="sm" color="text.muted" maxW="sm">
              Any .xlsx or .csv with a header row. Columns are detected
              automatically and you confirm the mapping before anything is saved.
            </Text>
            <Button as="label" leftIcon={<FileSpreadsheet size={16} />} cursor="pointer">
              Choose file
              <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
            </Button>
          </Stack>
        </CardBody></Card>
      )}

      {step === 'map' && (
        <>
          <Card><CardBody>
            <HStack mb={4}>
              <FileSpreadsheet size={18} />
              <Text fontWeight="600">{fileName}</Text>
              <Badge>{rows.length} rows</Badge>
              <Spacer />
              <Button size="sm" variant="ghost" onClick={() => setStep('upload')}>Change file</Button>
            </HStack>
            <Text fontSize="sm" color="text.muted" mb={3}>
              Match your columns to Budge fields. Date and Amount are required.
            </Text>
            <Stack spacing={3}>
              {IMPORT_FIELDS.map((f) => (
                <FormControl key={f.key}>
                  <FormLabel fontSize="sm" mb={1}>
                    {f.label}{f.required && <Text as="span" color="red.400"> *</Text>}
                  </FormLabel>
                  <Select size="sm" placeholder={f.required ? 'Select a column…' : '— none —'}
                    value={mapping[f.key] || ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </FormControl>
              ))}
            </Stack>
          </CardBody></Card>

          <Card><CardBody>
            <Text fontWeight="600" mb={2}>Preview</Text>
            {previewTx.length === 0 ? (
              <Text fontSize="sm" color="text.muted">
                Map Date and Amount to preview rows.
              </Text>
            ) : (
              <TableContainer>
                <Table size="sm" variant="simple">
                  <Thead><Tr>
                    <Th>Date</Th><Th>Description</Th><Th>Type</Th><Th isNumeric>Amount</Th>
                  </Tr></Thead>
                  <Tbody>
                    {previewTx.map((t, i) => (
                      <Tr key={i}>
                        <Td>{t.spent_at}</Td>
                        <Td>{t.description || <Text as="span" color="text.muted">—</Text>}</Td>
                        <Td>{t.kind}</Td>
                        <Td isNumeric fontWeight="600">{formatMoney(t.amount_minor, t.currency)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableContainer>
            )}
            <HStack mt={4}>
              <Spacer />
              <Button leftIcon={<Check size={16} />} isLoading={busy}
                isDisabled={!mapping.date || !mapping.amount} onClick={doImport}>
                Import {rows.length} rows
              </Button>
            </HStack>
          </CardBody></Card>
        </>
      )}

      {step === 'done' && result && (
        <Card><CardBody>
          <Stack spacing={3} align="center" py={6} textAlign="center">
            <Box color="green.500"><Check size={40} /></Box>
            <Heading size="md">Imported {result.inserted} transactions</Heading>
            {result.skipped > 0 && (
              <Text fontSize="sm" color="text.muted">
                Skipped {result.skipped} row{result.skipped === 1 ? '' : 's'} with a missing/invalid
                date or amount{result.errors.length ? ` (e.g. row ${result.errors[0].row}: ${result.errors[0].reason})` : ''}.
              </Text>
            )}
            <HStack pt={2}>
              <Button variant="ghost" onClick={() => { setStep('upload'); setResult(null) }}>Import another</Button>
              <Button onClick={() => navigate('/expenses')}>View expenses</Button>
            </HStack>
          </Stack>
        </CardBody></Card>
      )}
    </Stack>
  )
}

// Lightweight synchronous preview of the first few rows (no FX lookup — uses the
// row's own currency for display; exchange_rate is resolved at import time).
function useMemoPreview(rows, mapping, userId, baseCurrency, categories) {
  return useMemo(() => {
    if (!mapping.date || !mapping.amount) return []
    const out = []
    for (const r of rows.slice(0, 6)) {
      const amt = parseNum(r[mapping.amount])
      const date = parseDay(r[mapping.date])
      if (!date || !isFinite(amt) || amt === 0) continue
      let currency = mapping.currency ? String(r[mapping.currency] ?? '').toUpperCase().trim() : baseCurrency
      if (!CURRENCIES.includes(currency)) currency = baseCurrency
      let kind = 'expense'
      if (mapping.type) {
        const t = String(r[mapping.type] ?? '').toLowerCase()
        if (t.startsWith('income') || t === 'credit' || t === 'cr' || t === 'in') kind = 'income'
      }
      out.push({
        spent_at: date, kind, currency,
        amount_minor: toMinor(Math.abs(amt), currency),
        description: mapping.description && r[mapping.description] != null ? String(r[mapping.description]) : null,
      })
    }
    return out
  }, [rows, mapping, baseCurrency])
}
function parseNum(v) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number') return v
  let s = String(v).trim().replace(/[^\d.,-]/g, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '')
  else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.')
  return Number(s)
}
function parseDay(v) {
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  if (v == null || v === '') return null
  const d = new Date(v)
  return isNaN(d) ? null : d.toISOString().slice(0, 10)
}
