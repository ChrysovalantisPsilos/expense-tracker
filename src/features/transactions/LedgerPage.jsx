import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Stack, useDisclosure, Collapse, Text, HStack,
  IconButton, Input, InputGroup, InputLeftElement, InputRightElement, Select,
  FormControl, FormLabel, SimpleGrid, Button, Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react'
import {
  FileSpreadsheet, MoreHorizontal, Plus, ReceiptText, Search, SlidersHorizontal, X,
} from 'lucide-react'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import BackButton from '../../shared/ui/BackButton.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import CardHeader from '../../shared/ui/CardHeader.jsx'
import OptionalDate from '../../shared/ui/OptionalDate.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import TransactionList from './TransactionList.jsx'
import { listHeading } from './listHeading.js'
import { useTransactions, useCategories } from './useData.js'
import {
  isFiltering, filterTransactions, netBaseMinor, EMPTY_FILTERS, NO_CATEGORY,
} from './txnFilter.js'
import { parseLedgerParams, withLedgerParams } from './ledgerLinks.js'
import { monthRange } from '../../shared/lib/dates.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'

const OWN_EDIT = { ownEdit: true }
const TYPES = [['expense', 'Expenses'], ['income', 'Income'], ['all', 'All']]
const ADD_LABEL = { expense: 'Add expense', income: 'Add income', all: 'Add' }
const EMPTY_TEXT = {
  expense: 'Nothing logged yet.',
  income: 'No income logged yet.',
  all: 'Nothing logged this month yet.',
}

// The Transactions page (/transactions). The URL holds its whole state —
// `?type=expense|income|all`, the `?q=` search text and every filter
// (`category`, `from`, `to`, `min`, `max`; see ledgerLinks.js) — so it
// survives reloads, back/forward and links. Opened with filters already in
// the URL (a link), it shows a back button. With no search it shows this month's entries;
// searching (text or the Filters panel) spans all history, or the chosen
// dates. "Add" opens the transaction page (/transactions/new).
export default function LedgerPage() {
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
  const shown = searching ? filterTransactions(rows, { text, ...filters }, baseCurrency) : rows
  // A linked category that isn't in the picker (archived, or another kind's)
  // still shows as selected rather than a misleading "Any".
  const unlistedCategory = filters.categoryId && filters.categoryId !== NO_CATEGORY
    && !categoriesLoading && !categories.some((c) => c.id === filters.categoryId)
    ? rows.find((r) => r.category_id === filters.categoryId)?.categories?.name ?? 'Selected category'
    : null

  // Categories are per kind, so switching type drops the category filter.
  const switchType = (next) => setLedger({ type: next, categoryId: '' })

  const clearAll = () => setLedger({ ...EMPTY_FILTERS, text: '' }, { own: false })

  const net = netBaseMinor(shown, baseCurrency)
  const head = listHeading({ kind, periodLabel: 'This month', count: shown.length, loading, searching })

  return (
    <Stack spacing={5}>
      <PageHeader title="Transactions" leading={openedFiltered ? <BackButton /> : undefined} action={<>
        <PageAction icon={<Plus size={16} />} data-tour="add-expense" label={ADD_LABEL[type]}
          onClick={() => navigate(`/transactions/new?kind=${kind ?? 'expense'}`)} />
        <Menu placement="bottom-end" isLazy>
          <MenuButton as={IconButton} aria-label="More actions" size="sm" variant="ghost"
            icon={<MoreHorizontal size={18} />} />
          <MenuList minW="180px">
            <MenuItem icon={<FileSpreadsheet size={16} />} onClick={() => navigate('/import')}>
              Import file
            </MenuItem>
          </MenuList>
        </Menu>
      </>} />

      <SegmentedControl label="Transaction type" options={TYPES} value={type}
        onChange={switchType} size="sm" isFitted w={{ base: 'full', sm: 'sm' }} />

      <Panel>
        <Box mb={5}>
          <HStack spacing={2} data-tour="ledger-search">
            <InputGroup>
              <InputLeftElement pointerEvents="none" color="text.muted"><Search size={16} /></InputLeftElement>
              <Input ref={searchRef} enterKeyHint="search" aria-label="Search transactions"
                placeholder="Search transactions…"
                value={text} onChange={(e) => setLedger({ text: e.target.value })} />
              {text && (
                <InputRightElement>
                  <IconButton aria-label="Clear search" size="xs" variant="ghost"
                    icon={<X size={14} />} onClick={() => setLedger({ text: '' })} />
                </InputRightElement>
              )}
            </InputGroup>
            <Box position="relative" flexShrink={0}>
              <IconButton aria-label={hasFilters ? 'Filters (active)' : 'Filters'}
                aria-expanded={filtersPanel.isOpen}
                variant={filtersPanel.isOpen ? 'solid' : 'outline'}
                colorScheme={filtersPanel.isOpen ? 'brand' : 'gray'}
                icon={<SlidersHorizontal size={16} />} onClick={filtersPanel.onToggle} />
              {hasFilters && !filtersPanel.isOpen && (
                <Box position="absolute" top="-2px" right="-2px" boxSize="10px" borderRadius="full"
                  bg="brand.500" borderWidth="2px" borderColor="bg.surface" pointerEvents="none" />
              )}
            </Box>
          </HStack>

          <Collapse in={filtersPanel.isOpen} animateOpacity>
            <SimpleGrid key={fieldsKey} columns={{ base: 2, md: 3 }} spacing={3} pt={4}>
              <FormControl gridColumn={{ base: 'span 2', md: 'auto' }}>
                <FormLabel fontSize="xs" color="text.muted">Category</FormLabel>
                <Select placeholder="Any" value={filters.categoryId}
                  onChange={(e) => setFilter('categoryId')(e.target.value)}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  {unlistedCategory && <option value={filters.categoryId}>{unlistedCategory}</option>}
                  <option value={NO_CATEGORY}>Uncategorized</option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" color="text.muted">Min ({baseCurrency})</FormLabel>
                <MoneyInput currency={baseCurrency} placeholder="0" value={filters.min} onChange={setFilter('min')} />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" color="text.muted">Max ({baseCurrency})</FormLabel>
                <MoneyInput currency={baseCurrency} placeholder="∞" value={filters.max} onChange={setFilter('max')} />
              </FormControl>
              <FormControl>
                <OptionalDate label="From" value={filters.from} onChange={setFilter('from')} />
              </FormControl>
              <FormControl>
                <OptionalDate label="To" value={filters.to} onChange={setFilter('to')} />
              </FormControl>
            </SimpleGrid>
          </Collapse>
        </Box>

        <CardHeader icon={ReceiptText} title={head.title} divider
          subtitle={searching && !loading && shown.length > 0
            ? `${head.subtitle} · Net ${net < 0 ? '−' : ''}${formatMoney(Math.abs(net), baseCurrency)}`
            : head.subtitle}
          action={searching && (
            <Button size="xs" variant="ghost" leftIcon={<X size={14} />} onClick={clearAll}>
              Clear
            </Button>
          )} />
        {error ? <QueryError error={error} onRetry={reload} what="your transactions" /> : loading ? (
          <SkeletonRegion><SkeletonRows count={8} py={2.5} /></SkeletonRegion>
        ) : shown.length === 0 ? (
          <Text color="text.muted" fontSize="sm">
            {searching ? 'No transactions match this search.' : EMPTY_TEXT[type]}
          </Text>
        ) : (
          <TransactionList rows={shown} kind={kind} baseCurrency={baseCurrency}
            mutate={mutate} reload={reload} />
        )}
      </Panel>
    </Stack>
  )
}
