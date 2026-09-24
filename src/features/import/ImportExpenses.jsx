import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Heading, Stack, HStack, Text, Button, Spacer, Select,
  FormControl, FormLabel, useToast, IconButton, Input, Collapse,
} from '@chakra-ui/react'
import {
  ArrowLeft, UploadCloud, FileSpreadsheet, Check, Eye, Store, ArrowRightLeft, SlidersHorizontal,
} from 'lucide-react'
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
  parseWorkbook, buildTransactions, importTransactions, listRules, saveRule, rememberMapping,
} from './importExpenses.js'
import { previewDrafts, merchantKey } from './importMath.js'
import { CONFIDENCE_THRESHOLD, PRESET_NAMES } from './statementDetect.js'
import MappingFields from './MappingFields.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { userMessage } from '../../shared/lib/errors.js'
import { BusyNote, RingSpinner } from '../../shared/ui/RingLoader.jsx'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const mappingComplete = (m) => Boolean(m.date && (m.amount || (m.debit && m.credit)))

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
  const [headerRow, setHeaderRow] = useState(0)
  const [detection, setDetection] = useState(null) // { preset, confidence, remembered }
  const [showMapping, setShowMapping] = useState(false)
  const { busy, run } = useAsyncSubmit()
  const [reading, setReading] = useState(false) // parsing the chosen file
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(null)   // { valid, errors, groups }
  const [assign, setAssign] = useState({})       // merchant pattern -> category id
  const [missingRates, setMissingRates] = useState([]) // [{ currency, count }]
  const [rateInput, setRateInput] = useState({})  // currency -> typed rate

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setReading(true)
    try {
      const parsed = await parseWorkbook(file)
      if (!parsed.rows.length) { toast({ title: 'That file has no rows', status: 'warning' }); return }
      setFileName(file.name)
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      setHeaderRow(parsed.headerRow)
      setMapping(parsed.detection.mapping)
      setDetection(parsed.detection)
      // Sure enough → straight to the preview; otherwise ask for the columns.
      setShowMapping(parsed.detection.confidence < CONFIDENCE_THRESHOLD)
      setStep('map')
    } catch (err) {
      console.error('[import] file not read:', err)
      toast({ title: 'Couldn’t read that file', description: userMessage(err, 'This spreadsheet couldn’t be read.'),
        status: 'error', duration: 9000, isClosable: true })
    } finally {
      setReading(false)
    }
  }

  // Same rowToDraft + sign rule the real import uses, so the preview can't
  // misrepresent it (no FX lookup — shown in each row's own currency).
  const preview = useMemo(() => previewDrafts(rows, mapping, baseCurrency), [rows, mapping, baseCurrency])

  // Build rows (saved rules pre-categorize known merchants), then either go
  // straight to import or stop at the review step for unknown merchants.
  // `manualRates` fills in currencies the ECB lookup couldn't cover; while any
  // are still missing the import stops at the 'rates' step (never 1:1).
  async function prepare(manualRates = {}) {
    if (!mappingComplete(mapping)) {
      toast({ title: 'Map Date and Amount (or Debit + Credit) first', status: 'warning' }); return
    }
    rememberMapping(headers, mapping)
    await run(async () => {
      const rules = await listRules().catch(() => [])
      const { valid, errors, skipped, missingRates: missing } = await buildTransactions({
        rows, mapping, userId: user.id, baseCurrency, categories, rules, manualRates,
        firstRow: headerRow + 2,
      })
      if (missing.length) {
        setMissingRates(missing)
        setStep('rates')
        return
      }
      if (!valid.length) {
        toast({ title: 'Nothing to import', description: 'No rows had a valid date + amount.', status: 'warning' })
        return
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
        await finishImport(valid, errors, skipped, {})
      } else {
        setPending({ valid, errors, skipped, groups })
        setAssign({})
        setStep('review')
      }
    }, { errorTitle: 'Import failed' })
  }

  // Apply review choices (as both this-import categories and saved rules),
  // then insert. Duplicate-proof: re-imports are skipped server-side.
  async function finishImport(valid, errors, skipped, assignments) {
    await run(async () => {
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
      setResult({ inserted, duplicates, failed: errors.length, errors: errors.slice(0, 10), ignored: skipped.length })
      setStep('done')
      setPending(null)
    }, { errorTitle: 'Import failed' })
  }

  return (
    <Stack spacing={5} maxW="760px">
      <PageHeader eyebrow="Transactions" title="Import a bank statement" leading={
        <IconButton aria-label="Back" variant="ghost" size="sm" ml={-2} flexShrink={0}
          icon={<ArrowLeft size={18} />} onClick={() => navigate('/transactions')} />
      } />

      {step === 'upload' && (
        <Panel>
          <Stack spacing={4} align="center" py={8} textAlign="center">
            <IconTile icon={UploadCloud} size={64} radius="2xl" />
            <Text fontWeight="600">Upload a statement or spreadsheet</Text>
            <Text fontSize="sm" color="text.muted" maxW="sm">
              The CSV or Excel export from your bank (up to 5 MB), or any sheet
              with a header row. The layout is recognised automatically —
              including {PRESET_NAMES.join(', ')} — and you see a preview before
              anything is saved. Pending and declined payments are left out;
              foreign-currency rows convert at the ECB rate for their date.
            </Text>
            {reading ? (
              <BusyNote minH="40px">Reading your file…</BusyNote>
            ) : (
              <Button as="label" leftIcon={<FileSpreadsheet size={16} />} cursor="pointer">
                Choose file
                <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,text/csv" hidden onChange={onFile} />
              </Button>
            )}
          </Stack>
        </Panel>
      )}

      {step === 'map' && detection && (
        <>
          <Panel icon={FileSpreadsheet} title={fileName} subtitle={plural(rows.length, 'row')}
            action={<Button size="xs" variant="ghost" onClick={() => setStep('upload')}>Change file</Button>}>
            <HStack align="start" spacing={3}>
              <Text fontSize="sm" color="text.muted" flex="1">
                {detection.remembered
                  ? 'Using the columns you confirmed for this layout last time.'
                  : detection.preset
                    ? `Recognised: ${detection.preset.name} export.`
                    : detection.confidence >= CONFIDENCE_THRESHOLD
                      ? 'Columns detected automatically.'
                      : 'We couldn’t be sure which column is which — please check the mapping below.'}
                {' '}Check the preview before importing.
              </Text>
              <Button size="xs" variant="outline" leftIcon={<SlidersHorizontal size={14} />}
                aria-expanded={showMapping} onClick={() => setShowMapping((v) => !v)}>
                {showMapping ? 'Hide columns' : 'Adjust columns'}
              </Button>
            </HStack>
            <Collapse in={showMapping} animateOpacity>
              <Stack spacing={3} pt={4}>
                <Text fontSize="sm" color="text.muted">
                  Match your columns to Budgeer fields: Date, plus either a signed
                  Amount or Debit and Credit columns. Budgeer remembers your choice
                  for files with the same columns.
                </Text>
                <MappingFields headers={headers} mapping={mapping} onChange={setMapping} />
              </Stack>
            </Collapse>
          </Panel>

          <Panel icon={Eye} title="Preview" subtitle="The first rows, as they’ll be saved">
            {preview.rows.length === 0 ? (
              <Text fontSize="sm" color="text.muted">
                {mappingComplete(mapping)
                  ? 'No row could be read with these columns — adjust the mapping.'
                  : 'Map Date and Amount (or Debit + Credit) to preview rows.'}
              </Text>
            ) : (
              preview.rows.map((t, i) => (
                <ItemRow key={i} title={t.description || '—'} meta={`${t.spent_at} · ${t.kind}`}
                  amount={`${t.kind === 'income' ? '+' : '−'}${formatMoney(t.amount_minor, t.currency)}`} />
              ))
            )}
            {(preview.skipped > 0 || preview.errors > 0) && (
              <Text fontSize="xs" color="text.muted" mt={3}>
                {preview.skipped > 0 && `${plural(preview.skipped, 'line')} left out (pending, declined, balances or notes). `}
                {preview.errors > 0 && `${plural(preview.errors, 'row')} can’t be read (e.g. row ${preview.firstError.index + headerRow + 2}: ${preview.firstError.reason}).`}
              </Text>
            )}
            <HStack mt={4}>
              {busy && <BusyNote>Importing {plural(preview.ready, 'row')}…</BusyNote>}
              <Spacer />
              <Button leftIcon={<Check size={16} />} isLoading={busy} spinner={<RingSpinner />}
                isDisabled={preview.ready === 0} onClick={() => prepare()}>
                Import {plural(preview.ready, 'row')}
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
            {busy && <BusyNote>Importing {plural(preview.ready, 'row')}…</BusyNote>}
            <Spacer />
            <Button leftIcon={<Check size={16} />} isLoading={busy} spinner={<RingSpinner />}
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
                  <Text fontSize="sm" fontWeight="600" flex="1" minW={0} overflowWrap="anywhere">
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
            {busy && <BusyNote>Importing {plural(pending.valid.length, 'row')}…</BusyNote>}
            <Spacer />
            <Button leftIcon={<Check size={16} />} isLoading={busy} spinner={<RingSpinner />}
              onClick={() => finishImport(pending.valid, pending.errors, pending.skipped, assign)}>
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
            {result.failed > 0 && (
              <Text fontSize="sm" color="text.muted">
                Skipped {plural(result.failed, 'row')} with a missing/invalid
                date or amount{result.errors.length ? ` (e.g. row ${result.errors[0].row}: ${result.errors[0].reason})` : ''}.
              </Text>
            )}
            {result.ignored > 0 && (
              <Text fontSize="sm" color="text.muted">
                Left out {plural(result.ignored, 'line')} that {result.ignored === 1 ? 'isn’t a booked transaction' : 'aren’t booked transactions'} (pending,
                declined, balances or notes).
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
