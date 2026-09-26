import { NARROW_STACK } from '../lib/shortLandscape.js'
import { FOLD_ROW_ACTIONS } from './RowActions.jsx'
import { HIDE_CARD_ICONS } from './CardHeader.jsx'

// A page's two sideways stacks (Home, Savings) on the narrowest sideways
// screens (an iPhone SE or mini): the rows fold their edit/delete into the ⋯
// menu and the cards drop their header tiles, so titles keep their room.
// <Flex sx={NARROW_STACKS}>…the two stacks…</Flex>
export const NARROW_STACKS = { [NARROW_STACK]: { ...FOLD_ROW_ACTIONS, ...HIDE_CARD_ICONS } }
