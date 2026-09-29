import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Stack, useDisclosure, Collapse, Text, HStack,
  IconButton, Input, InputGroup, InputLeftElement, InputRightElement, Select,
  FormControl, FormLabel, SimpleGrid, Button, Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react'
import {
  FileSpreadsheet, MoreHorizontal, Plus, ReceiptText, Search, SlidersHorizontal, Wallet, X,
} from 'lucide-react'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import BackButton from '../../shared/ui/BackButton.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import CardHeader from '../../shared/ui/CardHeader.jsx'
import OptionalDate from '../../shared/ui/OptionalDate.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import TransactionList from './TransactionList.jsx'
import FirstEntry from './FirstEntry.jsx'
import { isFirstRun, listHeading } from './listHeading.js'
import { useTransactions, useOldestTransactionDate } from '../../shared/lib/transactions.js'
import { useCategories, useSavingsIds } from '../../shared/lib/categories.js'
import { isFiltering, filterTransactions, netBaseMinor, EMPTY_FILTERS } from './txnFilter.js'
import { NO_CATEGORY, categoryDisplayName } from '../../shared/lib/categoryName.js'
import { parseLedgerParams, withLedgerParams } from './ledgerLinks.js'
import { monthRange } from '../../shared/lib/dates.js'
import { formatSigned } from '../../shared/lib/currency.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'
import { useShellHeader } from '../../shared/ui/ShellHeader.jsx'
import { ONE_LINE } from '../../shared/lib/shortLandscape.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

const OWN_EDIT = { ownEdit: true }
// The type switch's values; each one's label, Add button and empty line are
// ledger.types / ledger.add / ledger.empty.<type>.
const TYPES = ['expense', 'income', 'all']

// The Transactions page (/transactions). The URL holds its whole state —
// `?type=expense|income|all`, the `?q=` search text and every filter
// (`category`, `from`, `to`, `min`, `max`; see ledgerLinks.js) — so it
// survives reloads, back/forward and links. Opened with filters already in
// the URL (a link), it shows a back button. With no search it shows this month's entries;
// searching (text or the Filters panel) spans all history, or the chosen
// dates. "Add" opens the transaction page (/transactions/new).
export default function LedgerPage() {
  const t = useT('transactions')
  const { baseCurrency = 'EUR' } = useProfile()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { type, text, filters } = parseLedgerParams(params)
  const kind = type === 'all' ? undefined : type

  // Edits replace the history entry (typing shouldn't stack up Back steps) and
  // are marked as the page's own. Any other URL change — a link, back/forward,
  // Clear — remounts the filter fields so they match the URL afresh (a date
  // switch holds its own on/off state).
  function setLedger(changes, { own = true } = {}) {
    setParams((p) => withLedgerParams(p, changes), { replace: true, state: own ? OWN_EDIT : null })
  }
  const [fieldsKey, setFieldsKey] = useState(location.key)
  if (!location.state?.ownEdit && fieldsKey !== location.key) setFieldsKey(location.key)
  const setFilter = (k) => (v) => setLedger({ [k]: v })
  const hasFilters = isFiltering('', filters)
  // Arriving with filters (a drill-down link) shows them, so they're visible
  // and clearable.
  const filtersPanel = useDisclosure({ defaultIsOpen: hasFilters })
  const [openedFiltered] = useState(hasFilters)

  // /search redirects here with { focusSearch } so the field is ready to type in.
  const searchRef = useRef(null)
  useEffect(() => {
    if (location.state?.focusSearch) searchRef.current?.focus()
  }, [location.key, location.state])

  const searching = isFiltering(text, filters)
  const month = monthRange()
  const { rows, loading, error, reload, mutate } = useTransactions(searching ? {
    kind,
    from: filters.from || undefined,
    to: filters.to || undefined,
    // "No category" can't be asked of the server; filterTransactions refines it.
    categoryId: filters.categoryId && filters.categoryId !== NO_CATEGORY ? filters.categoryId : undefined,
    limit: 1000,
  } : { kind, from: month.from, to: month.to })
  const { categories, loading: categoriesLoading } = useCategories(kind)
  // Whether anything was ever logged (null: nothing; undefined: not known),
  // rechecked as the live rows change.
  const [oldest, recheckOldest] = useOldestTransactionDate()
  useEffect(recheckOldest, [rows, recheckOldest])
  const shown = searching ? filterTransactions(rows, { text, ...filters }, baseCurrency) : rows
  // A linked category that isn't in the picker (archived, or another kind's)
  // still shows as selected rather than a misleading "Any".
  const unlistedCategory = filters.categoryId && filters.categoryId !== NO_CATEGORY
    && !categoriesLoading && !categories.some((c) => c.id === filters.categoryId)
    ? (categoryDisplayName(rows.find((r) => r.category_id === filters.categoryId)?.categories) || t('ledger.selectedCategory'))
    : null

  // Categories are per kind, so switching type drops the category filter.
  const switchType = (next) => setLedger({ type: next, categoryId: '' })

  const clearAll = () => setLedger({ ...EMPTY_FILTERS, text: '' }, { own: false })

  // A search's net leaves savings out (0084): they're not income.
  const { savingsIds, loading: savingsLoading } = useSavingsIds()
  const net = netBaseMinor(shown, baseCurrency, savingsIds)
  const head = listHeading({ kind, periodLabel: t('periods.thisMonth'), count: shown.length, loading, failed: !!error, searching })
  const firstRun = isFirstRun({ loading, failed: !!error, count: shown.length, oldest, searching })
  // A phone held sideways: the page's controls move up into the shell's header.
  const sideways = !!useShellHeader()

  // The list's heading line: "This month · 13 entries", with the net of a
  // search.
  const summary = searching && !loading && !savingsLoading && shown.length > 0
    ? `${head.subtitle} · ${t('ledger.net', { amount: formatSigned(net, baseCurrency) })}`
    : head.subtitle
  const clear = searching && (
    <Button size="xs" variant="ghost" leftIcon={<X size={14} />} onClick={clearAll}>
      {t('actions.clear')}
    </Button>
  )
  const typeSwitch = (props) => (
    <SegmentedControl label={t('ledger.typeLabel')} options={TYPES.map((v) => [v, t(`ledger.types.${v}`)])} value={type}
      onChange={switchType} size="sm" {...props} />
  )
  const moreMenu = (
    <Menu placement="bottom-end" isLazy>
      <MenuButton as={IconButton} aria-label={t('ledger.moreActions')} size="sm" variant="ghost"
        icon={<MoreHorizontal size={18} />} />
      <MenuList minW="180px">
        <MenuItem icon={<FileSpreadsheet size={16} />} onClick={() => navigate('/import')}>
          {t('ledger.importFile')}
        </MenuItem>
      </MenuList>
    </Menu>
  )
  const search = (
    <HStack spacing={2} data-tour="ledger-search" flex={sideways ? '1' : undefined} minW={sideways ? 0 : undefined}
      maxW={sideways ? '360px' : undefined}>
      <InputGroup size={sideways ? 'sm' : undefined}>
        <InputLeftElement pointerEvents="none" color="text.muted"><Search size={16} /></InputLeftElement>
        <Input ref={searchRef} enterKeyHint="search" aria-label={t('ledger.search')}
          placeholder={t('ledger.searchPlaceholder')} borderRadius={sideways ? 'lg' : undefined}
          value={text} onChange={(e) => setLedger({ text: e.target.value })} />
        {text && (
          <InputRightElement>
            <IconButton aria-label={t('ledger.clearSearch')} size="xs" variant="ghost"
              icon={<X size={14} />} onClick={() => setLedger({ text: '' })} />
          </InputRightElement>
        )}
      </InputGroup>
      <Box position="relative" flexShrink={0}>
        <IconButton aria-label={t(hasFilters ? 'ledger.filtersActive' : 'ledger.filters')}
          aria-expanded={filtersPanel.isOpen} size={sideways ? 'sm' : undefined}
          variant={filtersPanel.isOpen ? 'solid' : 'outline'}
          colorScheme={filtersPanel.isOpen ? 'brand' : 'gray'}
          icon={<SlidersHorizontal size={16} />} onClick={filtersPanel.onToggle} />
        {hasFilters && !filtersPanel.isOpen && (
          <Box position="absolute" top="-2px" right="-2px" boxSize="10px" borderRadius="full"
            bg="brand.500" borderWidth="2px" borderColor="bg.surface" pointerEvents="none" />
        )}
      </Box>
    </HStack>
  )
  const filterFields = (
    <Collapse in={filtersPanel.isOpen} animateOpacity>
      <SimpleGrid key={fieldsKey} columns={{ base: 2, md: 3 }} spacing={3} pt={4}>
        <FormControl gridColumn={{ base: 'span 2', md: 'auto' }}>
          <FormLabel fontSize="xs" color="text.muted">{t('ledger.category')}</FormLabel>
          <Select placeholder={t('ledger.anyCategory')} value={filters.categoryId}
            onChange={(e) => setFilter('categoryId')(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{categoryDisplayName(c)}</option>)}
            {unlistedCategory && <option value={filters.categoryId}>{unlistedCategory}</option>}
            <option value={NO_CATEGORY}>{t('uncategorized')}</option>
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel fontSize="xs" color="text.muted">{t('ledger.min', { currency: baseCurrency })}</FormLabel>
          <MoneyInput currency={baseCurrency} placeholder="0" value={filters.min} onChange={setFilter('min')} />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="xs" color="text.muted">{t('ledger.max', { currency: baseCurrency })}</FormLabel>
          <MoneyInput currency={baseCurrency} placeholder="∞" value={filters.max} onChange={setFilter('max')} />
        </FormControl>
        <FormControl>
          <OptionalDate label={t('ledger.from')} value={filters.from} onChange={setFilter('from')} />
        </FormControl>
        <FormControl>
          <OptionalDate label={t('ledger.to')} value={filters.to} onChange={setFilter('to')} />
        </FormControl>
      </SimpleGrid>
    </Collapse>
  )

  return (
    <Stack spacing={sideways ? 3 : 5}>
      {/* Sideways, the search and its filters sit in the slim header, and
          the rail's Add is the page's only one. */}
      <PageHeader title={t('ledger.title')} leading={openedFiltered ? <BackButton /> : undefined} action={sideways ? (
        <>{search}{moreMenu}</>
      ) : (<>
        <PageAction icon={<Plus size={16} />} data-tour="add-expense" label={t(`ledger.add.${type}`)}
          onClick={() => navigate(`/transactions/new?kind=${kind ?? 'expense'}`)} />
        {moreMenu}
      </>)} />

      {!sideways && typeSwitch({ isFitted: true, w: { base: 'full', sm: 'sm' } })}

      <Panel>
        {sideways ? (
          // One line over the list: the type, then how many (and Clear).
          <Box pb={2} mb={1} borderBottomWidth="1px" borderColor="border.default">
            <HStack spacing={3}>
              {typeSwitch({ size: 'xs', p: 0.5, flexShrink: 0 })}
              <Text flex="1" minW={0} fontSize="xs" color="text.muted" textAlign="right" sx={ONE_LINE}>
                {summary}
              </Text>
              {clear}
            </HStack>
            {filterFields}
          </Box>
        ) : (
          <>
            <Box mb={5}>
              {search}
              {filterFields}
            </Box>
            {/* Income wears Home's green wallet; expenses and all, the receipt. */}
            <CardHeader icon={type === 'income' ? Wallet : ReceiptText} iconTone={type === 'income' ? 'positive' : undefined}
              title={head.title} divider subtitle={summary} action={clear} />
          </>
        )}
        {error ? <QueryError error={error} onRetry={reload} what={t('ledger.what')} /> : loading ? (
          <SkeletonRegion><SkeletonRows count={8} py={2.5} /></SkeletonRegion>
        ) : firstRun ? (
          <FirstEntry />
        ) : shown.length === 0 ? (
          <Text color="text.muted" fontSize="sm">
            {t(searching ? 'ledger.noMatch' : `ledger.empty.${type}`)}
          </Text>
        ) : (
          <TransactionList rows={shown} kind={kind} baseCurrency={baseCurrency}
            mutate={mutate} reload={reload} />
        )}
      </Panel>
    </Stack>
  )
}
