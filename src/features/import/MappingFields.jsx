import { FormControl, FormLabel, Select, SimpleGrid, Text } from '@chakra-ui/react'
import { IMPORT_FIELDS } from './statementDetect.js'

const DATE_ORDERS = [
  { value: 'dmy', label: 'Day first (31/12/2026)' },
  { value: 'mdy', label: 'Month first (12/31/2026)' },
  { value: 'ymd', label: 'Year first (2026-12-31)' },
]
const DECIMALS = [
  { value: ',', label: 'Comma (1.234,56)' },
  { value: '.', label: 'Point (1,234.56)' },
]

// The column-mapping form: one select per import field (any header, or none)
// plus how the file writes dates and decimals. Controlled by the page.
export default function MappingFields({ headers, mapping, onChange }) {
  const set = (key, value) => onChange({ ...mapping, [key]: value })
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
      {IMPORT_FIELDS.map((f) => (
        <FormControl key={f.key}>
          <FormLabel fontSize="sm" mb={1}>
            {f.label}{f.required && <Text as="span" color="status.negative"> *</Text>}
            {f.hint && <Text as="span" color="text.muted" fontWeight="400"> · {f.hint}</Text>}
          </FormLabel>
          <Select size="sm" placeholder={f.required ? 'Select a column…' : '— none —'}
            value={mapping[f.key] || ''} onChange={(e) => set(f.key, e.target.value)}>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </Select>
        </FormControl>
      ))}
      <FormControl>
        <FormLabel fontSize="sm" mb={1}>Dates are written</FormLabel>
        <Select size="sm" value={mapping.dateOrder || 'dmy'} onChange={(e) => set('dateOrder', e.target.value)}>
          {DATE_ORDERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </FormControl>
      <FormControl>
        <FormLabel fontSize="sm" mb={1}>Decimal separator</FormLabel>
        <Select size="sm" value={mapping.decimal || '.'} onChange={(e) => set('decimal', e.target.value)}>
          {DECIMALS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </FormControl>
    </SimpleGrid>
  )
}
