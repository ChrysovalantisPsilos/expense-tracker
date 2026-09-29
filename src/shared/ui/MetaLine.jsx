import { Children } from 'react'
import { Box, Flex } from '@chakra-ui/react'
import { landscapeOnly, ONE_LINE } from '../lib/shortLandscape.js'

// The dot between two parts, and the room it takes (it is the gap).
const SEP = '12px'

// A part with the "·" before it, in its own left padding. The row is pulled
// left by that much inside a box that clips, so a part that starts a line
// (the first, or one that wrapped) has its dot cut off: a wrapped line never
// opens with "· meal vouchers".
const PART = {
  position: 'relative',
  pl: SEP,
  _before: {
    content: '"·"', position: 'absolute', left: 0, w: SEP, textAlign: 'center',
  },
}

// Sideways the line keeps to one line like the row's title (ItemRow): the
// parts run on as text, cut with an ellipsis at the end.
const SHORT = landscapeOnly({
  display: 'block',
  lineHeight: 1.35,
  ...ONE_LINE,
  '& > *, & > * > *': { display: 'inline' },
  '& svg': { display: 'inline', verticalAlign: '-1px' },
})

// A list row's muted meta line: its parts ("24 Sep", "Food & Dining",
// "⟳ Repeats every month") with a dot between each two, wrapping onto more
// lines on a phone. Each child is a part; `false`/`null` children are skipped.
// A part given as <MetaLine.Bare> (a tag) goes without a dot.
export default function MetaLine({ children, ...props }) {
  const parts = Children.toArray(children)
  return (
    <Box overflow="hidden" mt={0.5} {...props}>
      <Flex wrap="wrap" align="center" rowGap={1} ml={`-${SEP}`} fontSize="xs" color="text.muted" sx={SHORT}>
        {parts.map((part) => (
          <Box key={part.key} {...(part.type === Bare ? { pl: SEP } : PART)} minW={0}>{part}</Box>
        ))}
      </Flex>
    </Box>
  )
}

function Bare({ children }) {
  return children
}
MetaLine.Bare = Bare
