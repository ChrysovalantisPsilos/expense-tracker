import { useEffect, useMemo, useRef } from 'react'
import { Box, Button, Flex, HStack, IconButton, Image, Stack, Text, Wrap, WrapItem } from '@chakra-ui/react'
import { ImagePlus, Users, X } from 'lucide-react'
import { COVER_COLOURS, COVER_EMOJI, coverColour, groupColour } from './groupCover.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// No new picture picked.
export const NO_COVER = { kind: 'none' }

// A group's picture, chosen: a photo from the device, or one of the emoji on
// one of the colours (groupCover.js, the native app's choices too), with a
// preview. `value` is { kind: 'none' } | { kind: 'photo', file } |
// { kind: 'emoji', emoji, colour }; coverImage.coverFile turns it into the
// image to upload. `current` is the group's photo now (the edit page), and
// `colourKey` its own colour (the preview without a photo).
export default function CoverPicker({ value, onChange, current = null, colourKey = null }) {
  const t = useT('groups')
  const fileRef = useRef(null)
  const photoUrl = useMemo(() => (value.kind === 'photo' ? URL.createObjectURL(value.file) : null), [value])
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])
  const colour = value.kind === 'emoji' ? coverColour(value.colour) : groupColour(colourKey)
  const pickEmoji = (emoji) => onChange({ kind: 'emoji', emoji, colour: value.kind === 'emoji' ? value.colour : colour.key })
  const pickColour = (key) => onChange({ kind: 'emoji', emoji: value.kind === 'emoji' ? value.emoji : COVER_EMOJI[0], colour: key })

  function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onChange({ kind: 'photo', file })
  }

  const shownPhoto = photoUrl ?? (value.kind === 'none' ? current : null)
  return (
    <Stack spacing={4} align="center">
      <Box position="relative">
        {shownPhoto ? (
          <Image src={shownPhoto} alt="" boxSize="120px" objectFit="cover" borderRadius="3xl" boxShadow="md" />
        ) : (
          <Flex boxSize="120px" borderRadius="3xl" align="center" justify="center" boxShadow="md" color="white"
            bgGradient={`linear(to-br, ${colour.from}, ${colour.to})`} fontSize="56px" aria-hidden="true">
            {value.kind === 'emoji' ? value.emoji : <Users size={44} />}
          </Flex>
        )}
        {value.kind !== 'none' && (
          <IconButton aria-label={t('cover.reset')} icon={<X size={14} />} size="xs" borderRadius="full"
            position="absolute" top="-8px" right="-8px" onClick={() => onChange(NO_COVER)} />
        )}
      </Box>
      <Button size="sm" variant="outline" leftIcon={<ImagePlus size={16} />} onClick={() => fileRef.current?.click()}>
        {t('cover.photo')}
      </Button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      <Stack spacing={3} w="full">
        <Text fontSize="sm" color="text.muted">{t('cover.emoji')}</Text>
        <Wrap spacing={2}>
          {COVER_EMOJI.map((emoji) => {
            const picked = value.kind === 'emoji' && value.emoji === emoji
            return (
              <WrapItem key={emoji}>
                <Button aria-label={t('cover.emojiLabel', { emoji })} aria-pressed={picked} onClick={() => pickEmoji(emoji)}
                  boxSize="44px" minW="44px" p={0} fontSize="22px" borderRadius="xl" variant="ghost"
                  bg={picked ? 'accent.subtle' : 'bg.subtle'} borderWidth="2px"
                  borderColor={picked ? 'accent.fg' : 'transparent'}>
                  {emoji}
                </Button>
              </WrapItem>
            )
          })}
        </Wrap>
        <HStack spacing={3} flexWrap="wrap">
          {COVER_COLOURS.map((c) => {
            const picked = value.kind === 'emoji' && value.colour === c.key
            return (
              <Box key={c.key} as="button" type="button" aria-label={t(`cover.colours.${c.key}`)} aria-pressed={picked}
                onClick={() => pickColour(c.key)} boxSize="32px" borderRadius="full" borderWidth={0} p={0}
                bgGradient={`linear(to-br, ${c.from}, ${c.to})`}
                boxShadow={picked ? '0 0 0 2px var(--chakra-colors-bg-surface), 0 0 0 4px var(--chakra-colors-accent-fg)' : 'none'} />
            )
          })}
        </HStack>
      </Stack>
    </Stack>
  )
}
