import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Heading, Stack, HStack, Text, Button, Spacer, Select,
  FormControl, FormLabel, useToast, IconButton, Input,
} from '@chakra-ui/react'
import { ArrowLeft, UploadCloud, FileSpreadsheet, Check, Eye, Store, ArrowRightLeft } from 'lucide-react'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import Tile from '../../shared/ui/kit/Tile.jsx'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useCategories } from '../transactions/useData.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { formatMoney, parseManualRate } from '../../shared/lib/currency.js'
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

  const [step, setStep] = useState('upload') // upload | map | rates | review | done
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(null)   // { valid, errors, groups }
  const [assign, setAssign] = useState({})       // merchant pattern -> category id
  const [missingRates, setMissingRates] = useState([]) // [{ currency, count }]
  const [rateInput, setRateInput] = useState({})  // currency -> typed rate

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
  // `manualRates` fills in currencies the ECB lookup couldn't cover; while any
  // are still missing the import stops at the 'rates' step (never 1:1).
  async function prepare(manualRates = {}) {
    if (!mapping.date || !mapping.amount) {
      toast({ title: 'Map both Date and Amount first', status: 'warning' }); return
    }
    setBusy(true)
    try {
      const rules = await listRules().catch(() => [])
      const { valid, errors, missingRates: missing } = await buildTransactions({
        rows, mapping, userId: user.id, baseCurrency, categories, rules, manualRates,
      })
      if (missing.length) {
        setMissingRates(missing)
        setStep('rates')
        setBusy(false); return
      }
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
      <PageHeader eyebrow="Transactions" title="Import from Excel" leading={
        <IconButton aria-label="Back" variant="ghost" size="sm" ml={-2} flexShrink={0}
          icon={<ArrowLeft size={18} />} onClick={() => navigate('/transactions')} />
      } />

      {step === 'upload' && (
        <Panel>
          <Stack spacing={4} align="center" py={8} textAlign="center">
            <IconTile icon={UploadCloud} size={64} radius="2xl" />
            <Text fontWeight="600">Upload a spreadsheet</Text>
            <Text fontSize="sm" color="text.muted" maxW="sm">
              Any .xlsx or .csv (up to 5 MB) with a header row. Columns are
              detected automatically and you confirm the mapping before anything
              is saved. Foreign-currency rows convert at the ECB rate for their date.
            </Text>
            <Button as="label" leftIcon={<FileSpreadsheet size={16} />} cursor="pointer">
              Choose file
              <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
            </Button>
          </Stack>
        </Panel>
      )}

      {step === 'map' && (
        <>
          <Panel icon={FileSpreadsheet} title={fileName} subtitle={`${rows.length} rows`}
            action={<Button size="xs" variant="ghost" onClick={() => setStep('upload')}>Change file</Button>}>
            <Text fontSize="sm" color="text.muted" mb={3}>
              Match your columns to Budgeer fields. Date and Amount are required.
            </Text>
            <Stack spacing={3}>
              {IMPORT_FIELDS.map((f) => (
                <FormControl key={f.key}>
                  <FormLabel fontSize="sm" mb={1}>
                    {f.label}{f.required && <Text as="span" color="status.negative"> *</Text>}
                  </FormLabel>
                  <Select size="sm" placeholder={f.required ? 'Select a column…' : '— none —'}
                    value={mapping[f.key] || ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </FormControl>
              ))}
            </Stack>
          </Panel>

          <Panel icon={Eye} title="Preview" subtitle="The first rows, as they’ll be saved">
            {previewTx.length === 0 ? (
              <Text fontSize="sm" color="text.muted">
                Map Date and Amount to preview rows.
              </Text>
            ) : (
              previewTx.map((t, i) => (
                <ItemRow key={i} title={t.description || '—'} meta={`${t.spent_at} · ${t.kind}`}
                  amount={formatMoney(t.amount_minor, t.currency)} />
              ))
            )}
            <HStack mt={4}>
              <Spacer />
              <Button leftIcon={<Check size={16} />} isLoading={busy}
                isDisabled={!mapping.date || !mapping.amount} onClick={() => prepare()}>
                Import {rows.length} rows
              </Button>
            </HStack>
          </Panel>
        </>
      )}

      {step === 'rates' && (
        <Panel icon={ArrowRightLeft} title="Exchange rates needed">
          <Text fontSize="sm" color="text.muted" mb={4}>
            Budgeer couldn’t fetch the ECB rate for some rows (you may be offline,
            or the dates are before 1999). Enter the rate to use for them — rows
            that do have an ECB rate keep it.
          </Text>
          <Stack spacing={3}>
            {missingRates.map(({ currency, count }) => (
              <FormControl key={currency} isRequired>
                <FormLabel fontSize="sm" mb={1}>
                  1 {currency} = ? {baseCurrency}
                  <Text as="span" color="text.muted" fontWeight="400"> · {count} row{count === 1 ? '' : 's'}</Text>
                </FormLabel>
                <Input size="sm" maxW="180px" inputMode="decimal" autoComplete="off"
                  value={rateInput[currency] ?? ''} placeholder="e.g. 1.17"
                  onChange={(e) => setRateInput((m) => ({ ...m, [currency]: e.target.value }))} />
              </FormControl>
            ))}
          </Stack>
          <HStack mt={5}>
            <Button variant="ghost" onClick={() => setStep('map')}>Back</Button>
            <Spacer />
            <Button leftIcon={<Check size={16} />} isLoading={busy}
              isDisabled={missingRates.some(({ currency }) => !parseManualRate(rateInput[currency]))}
              onClick={() => prepare(Object.fromEntries(missingRates.map(({ currency }) =>
                [currency, parseManualRate(rateInput[currency])])))}>
              Continue
            </Button>
          </HStack>
        </Panel>
      )}

      {step === 'review' && pending && (
        <Panel icon={Store} title="New merchants">
          <Text fontSize="sm" color="text.muted" mb={4}>
            Pick categories for merchants Budgeer hasn’t seen before — each choice
            is remembered as a rule and applied automatically on every future
            import. Leave any blank to import those rows uncategorized.
          </Text>
          <Stack spacing={2}>
            {pending.groups.map((g) => (
              <Tile key={g.pattern}>
                <HStack spacing={3}>
                  <Text fontSize="sm" fontWeight="600" flex="1" noOfLines={1}>
                    {g.pattern}
                    <Text as="span" color="text.muted" fontWeight="400"> · {g.count} row{g.count === 1 ? '' : 's'}</Text>
                  </Text>
                  <Select size="sm" maxW="200px" bg="bg.surface" placeholder="Uncategorized"
                    value={assign[g.pattern] || ''}
                    onChange={(e) => setAssign((a) => ({ ...a, [g.pattern]: e.target.value }))}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </HStack>
              </Tile>
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
        </Panel>
      )}

      {step === 'done' && result && (
        <Panel>
          <Stack spacing={3} align="center" py={6} textAlign="center">
            <IconTile icon={Check} size={64} radius="2xl" tone="positive" />
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
              <Button onClick={() => navigate('/transactions?type=all')}>View transactions</Button>
            </HStack>
          </Stack>
        </Panel>
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
