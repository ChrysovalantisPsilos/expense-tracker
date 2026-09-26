import { Box, Button, VisuallyHidden } from '@chakra-ui/react'
import { useLanguage, useT } from '../lib/i18n/I18nProvider.jsx'
import { LANGUAGES, NATIVE_NAMES, SHORT_NAMES } from '../lib/i18n/language.js'
import SegmentedControl from './SegmentedControl.jsx'

// A language's short name in itself ("ΕΛ"), read out as its full name
// ("Ελληνικά") and marked with its own lang so screen readers say it right.
function Short({ lang }) {
  return (
    <Box as="span" lang={lang}>
      <span aria-hidden>{SHORT_NAMES[lang]}</span>
      <VisuallyHidden>{NATIVE_NAMES[lang]}</VisuallyHidden>
    </Box>
  )
}

// The signed-out pages' EN / ΕΛ switch (PublicHeader). From the sm
// breakpoint up, both languages side by side with the current one filled; on
// a phone, where the header is full, one small button naming the other
// language. It sets this device's preference only; signed in, Settings ›
// Language takes over.
export default function LanguageSwitch() {
  const t = useT()
  const { lang, setPref } = useLanguage()
  const other = LANGUAGES.find((l) => l !== lang)
  return (
    <>
      <Button size="sm" variant="ghost" px={2} minW={0} display={{ base: 'inline-flex', sm: 'none' }}
        onClick={() => setPref(other)}>
        <Short lang={other} />
      </Button>
      <SegmentedControl options={LANGUAGES.map((l) => [l, <Short key={l} lang={l} />])} value={lang}
        onChange={setPref} label={t('language.choose')} p={0.5} flexShrink={0}
        display={{ base: 'none', sm: 'flex' }} />
    </>
  )
}
