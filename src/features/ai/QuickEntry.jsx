import { useState } from 'react'
import {
  Box, FormControl, FormLabel, HStack, IconButton, Input, InputGroup, InputRightElement, Link, Text,
} from '@chakra-ui/react'
import { ArrowRight, CircleAlert, Sparkle } from 'lucide-react'
import { InfoBox, InfoButton, useInfoToggle } from '../../shared/ui/InfoToggle.jsx'
import { BusyNote, RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { useCategories } from '../../shared/lib/categories.js'
import { LINE_MAX } from '../../../supabase/functions/_shared/aiHelper.ts'
import { aiErrorKey } from './aiMath.js'
import { fillFromText } from './ai.js'

// "Type it" at the top of Add (when the helper is on): a line like "coffee
// 3.60 yesterday" → Fill → the form below is filled in for the user to check
// and save (`onFill(entry)`); Undo puts it back as it was (`onUndo`). Nothing
// is saved here.
export default function QuickEntry({ onFill, onUndo }) {
  const t = useT('ai')
  const { categories } = useCategories() // both kinds: a line can be either
  const info = useInfoToggle()
  const [text, setText] = useState('')
  const [state, setState] = useState('idle') // idle | working | done | error
  const [errorKey, setErrorKey] = useState(null)

  async function fill() {
    if (!text.trim() || state === 'working') return
    setState('working')
    try {
      onFill(await fillFromText(text.trim(), categories))
      setState('done')
    } catch (e) {
      setErrorKey(aiErrorKey(e.code))
      setState('error')
    }
  }

  return (
    <FormControl as="div">
      <HStack spacing={0.5} mb={2}>
        <FormLabel htmlFor="ai-type-it" mb={0} mr={0} display="inline-flex" alignItems="center" gap={1.5}>
          <Box as="span" color="accent.fg" display="inline-flex"><Sparkle size={15} fill="currentColor" aria-hidden /></Box>
          {t('add.label')}
        </FormLabel>
        <InfoButton info={info} label={t('settings.noteLabel')} />
      </HStack>
      <InputGroup>
        <Input id="ai-type-it" value={text} placeholder={t('add.placeholder')} enterKeyHint="go" autoComplete="off"
          maxLength={LINE_MAX} pr="52px" isReadOnly={state === 'working'}
          onChange={(e) => { setText(e.target.value); if (state === 'error') setState('idle') }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fill() } }} />
        <InputRightElement w="48px" h="full">
          <IconButton size="sm" aria-label={t('add.fill')} icon={<ArrowRight size={16} />} isDisabled={!text.trim()}
            isLoading={state === 'working'} spinner={<RingSpinner />} onClick={fill} />
        </InputRightElement>
      </InputGroup>
      <InfoBox info={info}>{t('add.more')}</InfoBox>
      {state === 'working' && <BusyNote mt={2}>{t('add.working')}</BusyNote>}
      {state === 'done' && (
        <Text fontSize="sm" color="text.muted" mt={2}>
          {t('add.done')}{' '}
          <Link as="button" type="button" color="accent.fg" fontWeight="600" py={2}
            onClick={() => { onUndo(); setState('idle') }}>{t('add.undo')}</Link>
        </Text>
      )}
      {state === 'error' && (
        <HStack role="alert" align="start" spacing={2} mt={2} fontSize="sm" color="status.warning">
          <Box pt="2px" flexShrink={0}><CircleAlert size={16} aria-hidden /></Box>
          <Text>{t(errorKey)}</Text>
        </HStack>
      )}
    </FormControl>
  )
}
