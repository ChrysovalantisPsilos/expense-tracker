import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Heading, Stack, HStack, Text, Button, Spacer, Select,
  FormControl, FormLabel, useToast, IconButton, Input, Collapse, Box,
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
  rememberedHolder, rememberHolder,
} from './importExpenses.js'
import {
  previewDrafts, merchantGroups, groupIdOf, suggestedHolder, fileHolder, newIncomeOptions, suggestionFor,
} from './importMath.js'
import { ensureCategory } from '../categories/categories.js'
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
  const { baseCurrency, profile } = useProfile()
  const { categories } = useCategories() // all kinds — rules can target either
  // Income categories to offer as "(new)" — the defaults the user lacks.
  const newIncome = useMemo(() => newIncomeOptions(categories), [categories])

  const [step, setStep] = useState('upload') // upload | map | rates | review | done
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [lines, setLines] = useState([]) // each row's line in the file
  const [detection, setDetection] = useState(null) // { preset, confidence, remembered }
  const [showMapping, setShowMapping] = useState(false)
  const { busy, run } = useAsyncSubmit()
  const [reading, setReading] = useState(false) // parsing the chosen file
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(null)   // { valid, errors, groups }
  const [assign, setAssign] = useState({})       // merchant pattern -> category id
  const [missingRates, setMissingRates] = useState([]) // [{ currency, count }]
  const [rateInput, setRateInput] = useState({})  // currency -> typed rate

  // A real, focusable button that opens the hidden picker (a label around
  // the input can't be reached with Tab).
  const fileInput = useRef(null)

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
      setLines(parsed.lines)
      // Files without a holder column (Revolut's) use the name the user gives.
      setMapping({ ...parsed.detection.mapping, holderName: suggestedHolder(rememberedHolder(), profile?.display_name) })
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
    rememberHolder(fileHolder(rows, mapping) || mapping.holderName)
    await run(async () => {
      const rules = await listRules().catch(() => [])
      const { valid, merchants, errors, skipped, missingRates: missing } = await buildTransactions({
        rows, mapping, userId: user.id, baseCurrency, categories, rules, manualRates,
        lines,
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
      // Unknown merchants: uncategorized rows grouped by merchant key + kind.
      const groups = merchantGroups(valid, merchants)
      if (groups.length === 0) {
        await finishImport(valid, merchants, errors, skipped, {}, [])
      } else {
        setPending({ valid, merchants, errors, skipped, groups })
        setAssign({})
        setStep('review')
      }
    }, { errorTitle: 'Import failed' })
  }

  // Apply review choices (as both this-import categories and saved rules),
  // then insert. Duplicate-proof: re-imports are skipped server-side.
  async function finishImport(valid, merchants, errors, skipped, assignments, groups) {
    await run(async () => {
      const chosen = new Map(Object.entries(assignments).filter(([, catId]) => catId))
      // A "(new)" suggestion becomes a real category first (once per name).
      const made = new Map()
      for (const [groupId, value] of chosen) {
        const s = suggestionFor(value)
        if (!s) continue
        if (!made.has(s.name)) made.set(s.name, await ensureCategory({ ...s, kind: 'income' }))
        chosen.set(groupId, made.get(s.name))
      }
      for (const g of groups) {
        const catId = chosen.get(g.id)
        if (catId) await saveRule(user.id, g.pattern, catId).catch(() => {}) // rule is a bonus, not a blocker
      }
      const withCats = valid.map((t) => {
        if (t.category_id || !t.description) return t
        const catId = chosen.get(groupIdOf(t, merchants))
        return catId ? { ...t, category_id: catId } : t
      })
      const { inserted, duplicates } = await importTransactions(withCats)
      const own = skipped.filter((s) => s.reason === 'own transfer').length
      setResult({
        inserted, duplicates, failed: errors.length, errors: errors.slice(0, 10),
        ownTransfers: own, ignored: skipped.length - own,
      })
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
            <input ref={fileInput} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,text/csv" hidden
              onChange={onFile} />
            {reading ? (
              <BusyNote minH="40px">Reading your file…</BusyNote>
            ) : (
              <Button leftIcon={<FileSpreadsheet size={16} />} onClick={() => fileInput.current?.click()}>
                Choose file
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
            {!mapping.holder && (
              <FormControl mt={4}>
                <FormLabel fontSize="sm" mb={1}>
                  Your name as banks write it
                  <Text as="span" color="text.muted" fontWeight="400"> · optional — transfers to and from yourself are left out</Text>
                </FormLabel>
                <Input size="sm" maxW="320px" autoComplete="name" maxLength={100}
                  value={mapping.holderName ?? ''} placeholder="e.g. Jane Doe"
                  onChange={(e) => setMapping((m) => ({ ...m, holderName: e.target.value }))} />
              </FormControl>
            )}
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
            {(preview.skipped > 0 || preview.ownTransfers > 0 || preview.errors > 0) && (
              <Text fontSize="xs" color="text.muted" mt={3}>
                {preview.ownTransfers > 0 && `${plural(preview.ownTransfers, 'transfer')} between your own accounts left out. `}
                {preview.skipped > 0 && `${plural(preview.skipped, 'line')} left out (pending, declined, balances or notes). `}
                {preview.errors > 0 && `${plural(preview.errors, 'row')} can’t be read (e.g. row ${lines[preview.firstError.index]}: ${preview.firstError.reason}).`}
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
            Pick categories for merchants and payers Budgeer hasn’t seen before —
            money in (like a salary) gets an income category, money out an expense
            one. Each choice is remembered as a rule and applied automatically on
            every future import. Leave any blank to import those rows uncategorized.
          </Text>
          <Stack spacing={2}>
            {pending.groups.map((g) => (
              <Tile key={g.id}>
                <Stack direction={{ base: 'column', sm: 'row' }} spacing={{ base: 2, sm: 3 }}
                  align={{ base: 'stretch', sm: 'center' }}>
                  <Box flex="1" minW={0}>
                    <Text fontSize="sm" fontWeight="600" overflowWrap="break-word">{g.pattern}</Text>
                    <Text fontSize="xs" color="text.muted">
                      {plural(g.count, 'row')} · {g.kind === 'income' ? 'money in' : 'money out'}
                    </Text>
                  </Box>
                  <Select size="sm" maxW={{ base: 'full', sm: '200px' }} bg="bg.surface" placeholder="Uncategorized"
                    aria-label={`Category for ${g.pattern} (${g.kind})`}
                    value={assign[g.id] || ''}
                    onChange={(e) => setAssign((a) => ({ ...a, [g.id]: e.target.value }))}>
                    {categories.filter((c) => c.kind === g.kind && !c.is_archived)
                      .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    {g.kind === 'income' && newIncome.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Stack>
              </Tile>
            ))}
          </Stack>
          <HStack mt={5}>
            <Button variant="ghost" onClick={() => { setPending(null); setStep('map') }}>Back</Button>
            {busy && <BusyNote>Importing {plural(pending.valid.length, 'row')}…</BusyNote>}
            <Spacer />
            <Button leftIcon={<Check size={16} />} isLoading={busy} spinner={<RingSpinner />}
              onClick={() => finishImport(pending.valid, pending.merchants, pending.errors, pending.skipped, assign, pending.groups)}>
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
            {result.ownTransfers > 0 && (
              <Text fontSize="sm" color="text.muted">
                Left out {plural(result.ownTransfers, 'transfer')} between your own accounts — they’re
                neither spending nor income.
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
