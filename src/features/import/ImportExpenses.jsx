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
  parseWorkbook, buildTransactions, importNewTransactions, listRules, saveRule, rememberMapping,
  rememberedHolder, rememberHolder,
} from './importExpenses.js'
import {
  previewDrafts, merchantGroups, groupIdOf, suggestedHolder, fileHolder, importedRange, categoryMatcher,
} from './importMath.js'
import { useImportRules } from './importRules.js'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import { shortDate } from '../../shared/lib/dates.js'
import { CONFIDENCE_THRESHOLD, PRESET_NAMES } from './statementDetect.js'
import { displayDescription } from './kbcLabels.js'
import MappingFields from './MappingFields.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { userMessage } from '../../shared/lib/errors.js'
import { BusyNote, RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { InfoNote } from '../../shared/ui/InfoToggle.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'

// A row's error code (importMath.rowToDraft) in words: import:reasons.*.
function reasonText(t, reason) {
  if (reason === 'missing/invalid date') return t('reasons.date')
  if (reason === 'missing/invalid amount') return t('reasons.amount')
  const currency = /^unsupported currency (.*)$/.exec(reason)
  return currency ? t('reasons.currency', { code: currency[1] }) : reason
}
const mappingComplete = (m) => Boolean(m.date && (m.amount || (m.debit && m.credit)))

export default function ImportExpenses() {
  const t = useT('import')
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { baseCurrency, profile } = useProfile()
  const { categories } = useCategories() // all kinds — rules can target either

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
      if (!parsed.rows.length) { toast({ title: t('toasts.noRows'), status: 'warning' }); return }
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
      toast({ title: t('toasts.unreadable'), description: userMessage(err, t('errors.unreadableShort')),
        status: 'error', duration: 9000, isClosable: true })
    } finally {
      setReading(false)
    }
  }

  // Same rowToDraft + sign rule the real import uses, so the preview can't
  // misrepresent it (no FX lookup — shown in each row's own currency).
  // Each row shows the category it will get (the file's column or a saved
  // rule), from the same matcher the import uses.
  const rules = useImportRules()
  const categoryOf = useMemo(() => categoryMatcher(categories, rules.rows), [categories, rules.rows])
  const categoryById = useMemo(() => new Map((categories || []).map((c) => [c.id, c])), [categories])
  const preview = useMemo(() => previewDrafts(rows, mapping, baseCurrency, { categoryOf }),
    [rows, mapping, baseCurrency, categoryOf])

  // Build rows (saved rules pre-categorize known merchants), then either go
  // straight to import or stop at the review step for unknown merchants.
  // `manualRates` fills in currencies the ECB lookup couldn't cover; while any
  // are still missing the import stops at the 'rates' step (never 1:1).
  async function prepare(manualRates = {}) {
    if (!mappingComplete(mapping)) {
      toast({ title: t('toasts.mapFirst'), status: 'warning' }); return
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
        toast({ title: t('toasts.nothing'), description: t('toasts.nothingText'), status: 'warning' })
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
    }, { errorTitle: t('toasts.failed') })
  }

  // Apply review choices (as both this-import categories and saved rules),
  // then insert. Duplicate-proof: rows the ledger already holds are left out
  // (importNewTransactions), and a re-import is skipped server-side too.
  async function finishImport(valid, merchants, errors, skipped, assignments, groups) {
    await run(async () => {
      const chosen = new Map(Object.entries(assignments).filter(([, catId]) => catId))
      for (const g of groups) {
        const catId = chosen.get(g.id)
        if (catId) await saveRule(user.id, g.pattern, catId).catch(() => {}) // rule is a bonus, not a blocker
      }
      const withCats = valid.map((t) => {
        if (t.category_id || !t.description) return t
        const catId = chosen.get(groupIdOf(t, merchants))
        return catId ? { ...t, category_id: catId } : t
      })
      const { inserted, duplicates } = await importNewTransactions(withCats)
      const own = skipped.filter((s) => s.reason === 'own transfer').length
      setResult({
        inserted, duplicates, failed: errors.length, errors: errors.slice(0, 10),
        ownTransfers: own, ignored: skipped.length - own, range: importedRange(withCats),
      })
      setStep('done')
      setPending(null)
    }, { errorTitle: t('toasts.failed') })
  }

  return (
    <Stack spacing={5} maxW="760px">
      <PageHeader eyebrow={t('transactions:ledger.title')} title={t('title')} leading={
        <IconButton aria-label={t('common:actions.back')} variant="ghost" size="sm" ml={-2} flexShrink={0}
          icon={<ArrowLeft size={18} />} onClick={() => navigate('/transactions')} />
      } />

      {step === 'upload' && (
        <Panel>
          <Stack spacing={4} align="center" py={8} textAlign="center">
            <IconTile icon={UploadCloud} size={64} radius="2xl" />
            <Text fontWeight="600">{t('upload.title')}</Text>
            <InfoNote maxW="sm" more={t('upload.more', { banks: PRESET_NAMES.join(', ') })}>
              {t('upload.text')}
            </InfoNote>
            <input ref={fileInput} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,text/csv" hidden
              onChange={onFile} />
            {reading ? (
              <BusyNote minH="40px">{t('upload.reading')}</BusyNote>
            ) : (
              <Button leftIcon={<FileSpreadsheet size={16} />} onClick={() => fileInput.current?.click()}>
                {t('upload.choose')}
              </Button>
            )}
          </Stack>
        </Panel>
      )}

      {step === 'map' && detection && (
        <>
          <Panel icon={FileSpreadsheet} title={fileName} subtitle={t('map.rows', { count: rows.length })}
            action={<Button size="xs" variant="ghost" onClick={() => setStep('upload')}>{t('map.changeFile')}</Button>}>
            <HStack align="start" spacing={3}>
              <Text fontSize="sm" color="text.muted" flex="1">
                {detection.remembered
                  ? t('map.remembered')
                  : detection.preset
                    ? t('map.recognised', { bank: detection.preset.name })
                    : t(detection.confidence >= CONFIDENCE_THRESHOLD ? 'map.detected' : 'map.unsure')}
                {' '}{t('map.checkPreview')}
              </Text>
              <Button size="xs" variant="outline" leftIcon={<SlidersHorizontal size={14} />}
                aria-expanded={showMapping} onClick={() => setShowMapping((v) => !v)}>
                {t(showMapping ? 'map.hideColumns' : 'map.adjustColumns')}
              </Button>
            </HStack>
            {!mapping.holder && (
              <FormControl mt={4}>
                <FormLabel fontSize="sm" mb={1}>
                  {t('map.holder')}
                  <Text as="span" color="text.muted" fontWeight="400"> · {t('map.holderHint')}</Text>
                </FormLabel>
                <Input size="sm" maxW="320px" autoComplete="name" maxLength={100}
                  value={mapping.holderName ?? ''} placeholder={t('map.holderPlaceholder')}
                  onChange={(e) => setMapping((m) => ({ ...m, holderName: e.target.value }))} />
              </FormControl>
            )}
            <Collapse in={showMapping} animateOpacity>
              <Stack spacing={3} pt={4}>
                <Text fontSize="sm" color="text.muted">{t('map.help')}</Text>
                <MappingFields headers={headers} mapping={mapping} onChange={setMapping} />
              </Stack>
            </Collapse>
          </Panel>

          <Panel icon={Eye} title={t('preview.title')} subtitle={t('preview.subtitle')}>
            {preview.rows.length === 0 ? (
              <Text fontSize="sm" color="text.muted">
                {t(mappingComplete(mapping) ? 'preview.unreadable' : 'preview.mapToPreview')}
              </Text>
            ) : (
              preview.rows.map((d, i) => {
                const category = categoryById.get(d.category_id)
                return (
                  <ItemRow key={i} title={displayDescription(d) || '—'}
                    media={<CategoryBadge category={category} kind={d.kind} size={32} />}
                    meta={category ? `${shortDate(d.spent_at)} · ${categoryDisplayName(category)}` : shortDate(d.spent_at)}
                    amount={`${d.kind === 'income' ? '+' : ''}${formatMoney(d.amount_minor, d.currency)}`}
                    amountTone={d.kind === 'income' ? 'positive' : 'default'} />
                )
              })
            )}
            {(preview.skipped > 0 || preview.ownTransfers > 0 || preview.errors > 0) && (
              <Text fontSize="xs" color="text.muted" mt={3}>
                {preview.ownTransfers > 0 && `${t('preview.ownTransfers', { count: preview.ownTransfers })} `}
                {preview.skipped > 0 && `${t('preview.skipped', { count: preview.skipped })} `}
                {preview.errors > 0 && t('preview.errors', {
                  count: preview.errors, line: lines[preview.firstError.index],
                  reason: reasonText(t, preview.firstError.reason),
                })}
              </Text>
            )}
            <HStack mt={4}>
              {busy && <BusyNote>{t('preview.importing', { count: preview.ready })}</BusyNote>}
              <Spacer />
              <Button leftIcon={<Check size={16} />} isLoading={busy} spinner={<RingSpinner />}
                isDisabled={preview.ready === 0} onClick={() => prepare()}>
                {t('preview.import', { count: preview.ready })}
              </Button>
            </HStack>
          </Panel>
        </>
      )}

      {step === 'rates' && (
        <Panel icon={ArrowRightLeft} title={t('rates.title')}>
          <Text fontSize="sm" color="text.muted" mb={4}>{t('rates.text')}</Text>
          <Stack spacing={3}>
            {missingRates.map(({ currency, count }) => (
              <FormControl key={currency} isRequired>
                <FormLabel fontSize="sm" mb={1}>
                  {t('rates.rate', { currency, base: baseCurrency })}
                  <Text as="span" color="text.muted" fontWeight="400"> · {t('map.rows', { count })}</Text>
                </FormLabel>
                <Input size="sm" maxW="180px" inputMode="decimal" autoComplete="off"
                  value={rateInput[currency] ?? ''} placeholder={t('rates.placeholder')}
                  onChange={(e) => setRateInput((m) => ({ ...m, [currency]: e.target.value }))} />
              </FormControl>
            ))}
          </Stack>
          <HStack mt={5}>
            <Button variant="ghost" onClick={() => setStep('map')}>{t('common:actions.back')}</Button>
            {busy && <BusyNote>{t('preview.importing', { count: preview.ready })}</BusyNote>}
            <Spacer />
            <Button leftIcon={<Check size={16} />} isLoading={busy} spinner={<RingSpinner />}
              isDisabled={missingRates.some(({ currency }) => !parseManualRate(rateInput[currency]))}
              onClick={() => prepare(Object.fromEntries(missingRates.map(({ currency }) =>
                [currency, parseManualRate(rateInput[currency])])))}>
              {t('rates.continue')}
            </Button>
          </HStack>
        </Panel>
      )}

      {step === 'review' && pending && (
        <Panel icon={Store} title={t('review.title')}>
          <Text fontSize="sm" color="text.muted" mb={4}>{t('review.text')}</Text>
          <Stack spacing={2}>
            {pending.groups.map((g) => (
              <Tile key={g.id}>
                <Stack direction={{ base: 'column', sm: 'row' }} spacing={{ base: 2, sm: 3 }}
                  align={{ base: 'stretch', sm: 'center' }}>
                  <Box flex="1" minW={0}>
                    <Text fontSize="sm" fontWeight="600" overflowWrap="break-word">{g.pattern}</Text>
                    <Text fontSize="xs" color="text.muted">
                      {t('map.rows', { count: g.count })} · {t(g.kind === 'income' ? 'review.moneyIn' : 'review.moneyOut')}
                    </Text>
                  </Box>
                  <Select size="sm" maxW={{ base: 'full', sm: '200px' }} bg="bg.surface" placeholder={t('review.uncategorized')}
                    aria-label={t('review.categoryFor', { merchant: g.pattern, kind: t(`preview.kind.${g.kind}`) })}
                    value={assign[g.id] || ''}
                    onChange={(e) => setAssign((a) => ({ ...a, [g.id]: e.target.value }))}>
                    {categories.filter((c) => c.kind === g.kind && !c.is_archived)
                      .map((c) => <option key={c.id} value={c.id}>{categoryDisplayName(c)}</option>)}
                  </Select>
                </Stack>
              </Tile>
            ))}
          </Stack>
          <HStack mt={5}>
            <Button variant="ghost" onClick={() => { setPending(null); setStep('map') }}>{t('common:actions.back')}</Button>
            {busy && <BusyNote>{t('preview.importing', { count: pending.valid.length })}</BusyNote>}
            <Spacer />
            <Button leftIcon={<Check size={16} />} isLoading={busy} spinner={<RingSpinner />}
              onClick={() => finishImport(pending.valid, pending.merchants, pending.errors, pending.skipped, assign, pending.groups)}>
              {t('review.import', { count: pending.valid.length })}
            </Button>
          </HStack>
        </Panel>
      )}

      {step === 'done' && result && (
        <Panel>
          <Stack spacing={3} align="center" py={6} textAlign="center">
            <IconTile icon={Check} size={64} radius="2xl" tone="positive" />
            <Heading size="md">{t('done.title', { count: result.inserted })}</Heading>
            {result.range && (
              <Text fontSize="sm">{t('done.dated', {
                from: shortDate(result.range.from), to: shortDate(result.range.to) })}</Text>
            )}
            {result.duplicates > 0 && (
              <Text fontSize="sm" color="text.muted">{t('done.duplicates', { count: result.duplicates })}</Text>
            )}
            {result.failed > 0 && (
              <Text fontSize="sm" color="text.muted">
                {result.errors.length
                  ? t('done.failedExample', {
                    count: result.failed, line: result.errors[0].row, reason: reasonText(t, result.errors[0].reason),
                  })
                  : t('done.failed', { count: result.failed })}
              </Text>
            )}
            {result.ownTransfers > 0 && (
              <Text fontSize="sm" color="text.muted">{t('done.ownTransfers', { count: result.ownTransfers })}</Text>
            )}
            {result.ignored > 0 && (
              <Text fontSize="sm" color="text.muted">{t('done.ignored', { count: result.ignored })}</Text>
            )}
            <HStack pt={2}>
              <Button variant="ghost" onClick={() => { setStep('upload'); setResult(null) }}>{t('done.another')}</Button>
              <Button onClick={() => navigate(`/transactions?${new URLSearchParams({
                type: 'all', ...(result.range ?? {}) })}`)}>{t('done.view')}</Button>
            </HStack>
          </Stack>
        </Panel>
      )}
    </Stack>
  )
}
