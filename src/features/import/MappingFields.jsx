import { FormControl, FormLabel, Select, SimpleGrid, Text } from '@chakra-ui/react'
import { DATE_ORDERS, DECIMALS, IMPORT_FIELDS } from './statementDetect.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// A required field's asterisk, after its label.
const REQUIRED_MARK = ' *'

// The column-mapping form: one select per import field (any header, or none)
// plus how the file writes dates and decimals. Controlled by the page.
export default function MappingFields({ headers, mapping, onChange }) {
  const t = useT('import')
  const set = (key, value) => onChange({ ...mapping, [key]: value })
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
      {IMPORT_FIELDS.map((f) => (
        <FormControl key={f.key}>
          <FormLabel fontSize="sm" mb={1}>
            {t(`fields.${f.key}.label`)}{f.required && <Text as="span" color="status.negative">{REQUIRED_MARK}</Text>}
            {f.hint && <Text as="span" color="text.muted" fontWeight="400"> · {t(`fields.${f.key}.hint`)}</Text>}
          </FormLabel>
          <Select size="sm" placeholder={t(f.required ? 'mapping.selectColumn' : 'mapping.noColumn')}
            value={mapping[f.key] || ''} onChange={(e) => set(f.key, e.target.value)}>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </Select>
        </FormControl>
      ))}
      <FormControl>
        <FormLabel fontSize="sm" mb={1}>{t('mapping.dateOrder')}</FormLabel>
        <Select size="sm" value={mapping.dateOrder || 'dmy'} onChange={(e) => set('dateOrder', e.target.value)}>
          {DATE_ORDERS.map((v) => <option key={v} value={v}>{t(`mapping.dateOrders.${v}`)}</option>)}
        </Select>
      </FormControl>
      <FormControl>
        <FormLabel fontSize="sm" mb={1}>{t('mapping.decimal')}</FormLabel>
        <Select size="sm" value={mapping.decimal || '.'} onChange={(e) => set('decimal', e.target.value)}>
          {DECIMALS.map((o) => <option key={o.value} value={o.value}>{t(`mapping.decimals.${o.id}`)}</option>)}
        </Select>
      </FormControl>
    </SimpleGrid>
  )
}
