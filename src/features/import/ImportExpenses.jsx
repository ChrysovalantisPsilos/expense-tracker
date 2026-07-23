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
import { formatMoney } from '../../shared/lib/currency.js'
import {
  IMPORT_FIELDS, parseWorkbook, guessMapping, buildTransactions, importTransactions,
  listRules, saveRule, merchantKey,
} from './importExpenses.js'
import { rowToDraft } from './importMath.js'

export default function ImportExpenses() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { baseCurrency } = useProfile()
  const { categories } = useCategories() // all kinds — rules can target either

  const [step, setStep] = useState('upload') // upload | map | review | done
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(null)   // { valid, errors, groups }
  const [assign, setAssign] = useState({})       // merchant pattern -> category id

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
      toast({ title: 'Couldn’t read that file', description: err.message,
        status: 'error', duration: 9000, isClosable: true })
    }
  }

  const previewTx = useMemoPreview(rows, mapping, baseCurrency)

  // Build rows (saved rules pre-categorize known merchants), then either go
  // straight to import or stop at the review step for unknown merchants.
  async function prepare() {
    if (!mapping.date || !mapping.amount) {
      toast({ title: 'Map both Date and Amount first', status: 'warning' }); return
    }
    setBusy(true)
    try {
      const rules = await listRules().catch(() => [])
      const { valid, errors } = await buildTransactions({
        rows, mapping, userId: user.id, baseCurrency, categories, rules,
      })
      if (!valid.length) {
        toast({ title: 'Nothing to import', description: 'No rows had a valid date + amount.', status: 'warning' })
        setBusy(false); return
      }
      // Unknown merchants: uncategorized rows grouped by merchant key.
      const byMerchant = new Map()
      for (const t of valid) {
        if (t.category_id || !t.description) continue
        const key = merchantKey(t.description)
        if (!key) continue
        byMerchant.set(key, (byMerchant.get(key) ?? 0) + 1)
      }
      const groups = [...byMerchant.entries()]
        .map(([pattern, count]) => ({ pattern, count }))
        .sort((a, b) => b.count - a.count)
      if (groups.length === 0) {
        await finishImport(valid, errors, {})
      } else {
        setPending({ valid, errors, groups })
        setAssign({})
        setStep('review')
      }
    } catch (err) {
      toast({ title: 'Import failed', description: err.message, status: 'error' })
    } finally { setBusy(false) }
  }

  // Apply review choices (as both this-import categories and saved rules),
  // then insert. Duplicate-proof: re-imports are skipped server-side.
  async function finishImport(valid, errors, assignments) {
    setBusy(true)
    try {
      const chosen = Object.entries(assignments).filter(([, catId]) => catId)
      for (const [pattern, catId] of chosen) {
        await saveRule(user.id, pattern, catId).catch(() => {}) // rule is a bonus, not a blocker
      }
      const withCats = valid.map((t) => {
        if (t.category_id || !t.description) return t
        const hit = chosen.find(([pattern]) => merchantKey(t.description) === pattern)
        return hit ? { ...t, category_id: hit[1] } : t
      })
      const { inserted, duplicates } = await importTransactions(withCats)
      setResult({ inserted, duplicates, skipped: errors.length, errors: errors.slice(0, 10) })
      setStep('done')
      setPending(null)
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
              Match your columns to Budgeer fields. Date and Amount are required.
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
                isDisabled={!mapping.date || !mapping.amount} onClick={prepare}>
                Import {rows.length} rows
              </Button>
            </HStack>
          </CardBody></Card>
        </>
      )}

      {step === 'review' && pending && (
        <Card><CardBody>
          <Text fontWeight="600" mb={1}>New merchants</Text>
          <Text fontSize="sm" color="text.muted" mb={4}>
            Pick categories for merchants Budgeer hasn’t seen before — each choice
            is remembered as a rule and applied automatically on every future
            import. Leave any blank to import those rows uncategorized.
          </Text>
          <Stack spacing={2}>
            {pending.groups.map((g) => (
              <HStack key={g.pattern} spacing={3}>
                <Text fontSize="sm" fontWeight="600" flex="1" noOfLines={1}>
                  {g.pattern}
                  <Text as="span" color="text.muted" fontWeight="400"> · {g.count} row{g.count === 1 ? '' : 's'}</Text>
                </Text>
                <Select size="sm" maxW="200px" placeholder="Uncategorized"
                  value={assign[g.pattern] || ''}
                  onChange={(e) => setAssign((a) => ({ ...a, [g.pattern]: e.target.value }))}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </HStack>
            ))}
          </Stack>
          <HStack mt={5}>
            <Button variant="ghost" onClick={() => { setPending(null); setStep('map') }}>Back</Button>
            <Spacer />
            <Button leftIcon={<Check size={16} />} isLoading={busy}
              onClick={() => finishImport(pending.valid, pending.errors, assign)}>
              Import {pending.valid.length} rows
            </Button>
          </HStack>
        </CardBody></Card>
      )}

      {step === 'done' && result && (
        <Card><CardBody>
          <Stack spacing={3} align="center" py={6} textAlign="center">
            <Box color="green.500"><Check size={40} /></Box>
            <Heading size="md">Imported {result.inserted} transactions</Heading>
            {result.duplicates > 0 && (
              <Text fontSize="sm" color="text.muted">
                {result.duplicates} row{result.duplicates === 1 ? ' was' : 's were'} already
                imported before and got skipped — re-importing never duplicates.
              </Text>
            )}
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
// row's own currency for display; exchange_rate is resolved at import time). Uses
// the same rowToDraft the real import does, so the preview can't misrepresent it.
function useMemoPreview(rows, mapping, baseCurrency) {
  return useMemo(() => {
    if (!mapping.date || !mapping.amount) return []
    const out = []
    for (const r of rows.slice(0, 6)) {
      const draft = rowToDraft(r, mapping, baseCurrency)
      if (draft.error) continue
      out.push({
        spent_at: draft.spent_at, kind: draft.kind, currency: draft.currency,
        amount_minor: draft.amount_minor, description: draft.description,
      })
    }
    return out
  }, [rows, mapping, baseCurrency])
}
