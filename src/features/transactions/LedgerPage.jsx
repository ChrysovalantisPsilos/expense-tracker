import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Stack, Card, CardBody, useDisclosure, Collapse, Text, Center, Spinner, HStack,
  IconButton, Input, InputGroup, InputLeftElement, InputRightElement, Select,
  FormControl, FormLabel, SimpleGrid, Button, Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react'
import {
  CalendarDays, FileSpreadsheet, ListFilter, MoreHorizontal, Plus, Search, SlidersHorizontal, X,
} from 'lucide-react'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import CardHeader from '../../shared/ui/CardHeader.jsx'
import OptionalDate from '../../shared/ui/OptionalDate.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import TransactionForm from './TransactionForm.jsx'
import TransactionList from './TransactionList.jsx'
import { useTransactions, useCategories } from './useData.js'
import {
  parseTxnType, isFiltering, filterTransactions, netBaseMinor, EMPTY_FILTERS,
} from './txnFilter.js'
import { monthRange } from '../../shared/lib/dates.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { useProfile } from '../../shared/lib/useProfile.js'

const TYPES = [['expense', 'Expenses'], ['income', 'Income'], ['all', 'All']]
const KINDS = [['expense', 'Expense'], ['income', 'Income']]
const ADD_LABEL = { expense: 'Add expense', income: 'Add income', all: 'Add' }
const EMPTY_TEXT = {
  expense: 'Nothing logged yet.',
  income: 'No income logged yet.',
  all: 'Nothing logged this month yet.',
}

// The Transactions page (/transactions). `?type=expense|income|all` picks the
// ledger and `?q=` is the search text, so both survive reloads and links.
// With no search it shows this month's entries; searching (text or the
// Filters panel) spans all history. The add form stays folded behind "Add".
export default function LedgerPage() {
  const { baseCurrency = 'EUR' } = useProfile()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const type = parseTxnType(params.get('type'))
  const text = params.get('q') ?? ''
  const kind = type === 'all' ? undefined : type

  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const setFilter = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }))
  const filtersPanel = useDisclosure()
  const addForm = useDisclosure()
  const [pickedKind, setPickedKind] = useState('expense') // the form's kind under "All"
  const formKind = kind ?? pickedKind

  // /search redirects here with { focusSearch } so the field is ready to type in.
  const searchRef = useRef(null)
  useEffect(() => {
    if (location.state?.focusSearch) searchRef.current?.focus()
  }, [location.key, location.state])

  const searching = isFiltering(text, filters)
  const month = monthRange()
  const { rows, loading, reload, mutate } = useTransactions(searching ? {
    kind,
    from: filters.from || undefined,
    to: filters.to || undefined,
    categoryId: filters.categoryId || undefined,
    limit: 1000,
  } : { kind, from: month.from, to: month.to })
  const { categories } = useCategories(kind)
  const shown = searching ? filterTransactions(rows, { text, ...filters }, baseCurrency) : rows

  function setParam(key, value) {
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (value) next.set(key, value); else next.delete(key)
      return next
    }, { replace: true })
  }

  function switchType(next) {
    setParam('type', next)
    setFilters((f) => ({ ...f, categoryId: '' })) // categories are per kind
  }

  function clearAll() {
    setFilters(EMPTY_FILTERS)
    setParam('q', '')
  }

  const net = netBaseMinor(shown, baseCurrency)

  return (
    <Stack spacing={5}>
      <PageHeader title="Transactions" action={<>
        <PageAction icon={addForm.isOpen ? <X size={16} /> : <Plus size={16} />}
          label={addForm.isOpen ? 'Hide form' : ADD_LABEL[type]} onClick={addForm.onToggle} />
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

      <Collapse in={addForm.isOpen} animateOpacity>
        <Card><CardBody>
          <Stack spacing={4}>
            {!kind && (
              <SegmentedControl label="Kind to add" options={KINDS} value={pickedKind}
                onChange={setPickedKind} size="sm" isFitted />
            )}
            <TransactionForm key={formKind} kind={formKind} baseCurrency={baseCurrency}
              onSaved={() => { reload(); addForm.onClose() }} />
          </Stack>
        </CardBody></Card>
      </Collapse>

      <Card><CardBody>
        <Box mb={4}>
          <HStack spacing={2}>
            <InputGroup>
              <InputLeftElement pointerEvents="none" color="text.muted"><Search size={16} /></InputLeftElement>
              <Input ref={searchRef} enterKeyHint="search" aria-label="Search transactions"
                placeholder="Search transactions…"
                value={text} onChange={(e) => setParam('q', e.target.value)} />
              {text && (
                <InputRightElement>
                  <IconButton aria-label="Clear search" size="xs" variant="ghost"
                    icon={<X size={14} />} onClick={() => setParam('q', '')} />
                </InputRightElement>
              )}
            </InputGroup>
            <IconButton aria-label="Filters" aria-expanded={filtersPanel.isOpen} flexShrink={0}
              variant={filtersPanel.isOpen ? 'solid' : 'outline'}
              colorScheme={filtersPanel.isOpen ? 'brand' : 'gray'}
              icon={<SlidersHorizontal size={16} />} onClick={filtersPanel.onToggle} />
          </HStack>

          <Collapse in={filtersPanel.isOpen} animateOpacity>
            <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3} pt={4}>
              <FormControl gridColumn={{ base: 'span 2', md: 'auto' }}>
                <FormLabel fontSize="xs" color="text.muted">Category</FormLabel>
                <Select placeholder="Any" value={filters.categoryId}
                  onChange={(e) => setFilter('categoryId')(e.target.value)}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" color="text.muted">Min ({baseCurrency})</FormLabel>
                <Input type="number" inputMode="decimal" placeholder="0"
                  value={filters.min} onChange={(e) => setFilter('min')(e.target.value)} />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" color="text.muted">Max ({baseCurrency})</FormLabel>
                <Input type="number" inputMode="decimal" placeholder="∞"
                  value={filters.max} onChange={(e) => setFilter('max')(e.target.value)} />
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

        {searching ? (
          <CardHeader icon={ListFilter}
            title={loading ? 'Searching…' : `${shown.length} result${shown.length === 1 ? '' : 's'}`}
            action={<>
              {!loading && shown.length > 0 && (
                <Text fontSize="sm" color="text.muted">
                  Net {net < 0 ? '−' : ''}{formatMoney(Math.abs(net), baseCurrency)}
                </Text>
              )}
              <Button size="xs" variant="ghost" leftIcon={<X size={14} />} onClick={clearAll}>
                Clear
              </Button>
            </>} />
        ) : (
          <CardHeader icon={CalendarDays} title="This month" />
        )}
        {loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : shown.length === 0 ? (
          <Text color="text.muted">
            {searching ? 'No transactions match this search.' : EMPTY_TEXT[type]}
          </Text>
        ) : (
          <TransactionList rows={shown} kind={formKind} baseCurrency={baseCurrency}
            mutate={mutate} reload={reload} />
        )}
      </CardBody></Card>
    </Stack>
  )
}
