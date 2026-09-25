import { Fragment, useId, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Link, Stack, Td, Tr } from '@chakra-ui/react'
import { formatMoney } from '../../shared/lib/currency.js'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'

// One "Spending by category" bar (a linkBuckets(categoryBars(...)) row). A
// folded "Other" is a disclosure button: tapping it lists the categories it
// holds right under it, each a bar that opens its own page like the top rows.
// `iconOf(name)` renders a bucket's icon.
export default function CategoryBarRow({ bar, baseCurrency, iconOf }) {
  const [open, setOpen] = useState(false)
  const membersId = useId()
  const row = (c, props) => (
    <ProgressRow role="listitem"
      title={c.name} meta={formatMoney(c.value, baseCurrency)}
      tooltip={`${c.name}: ${formatMoney(c.value, baseCurrency)} (${c.share}%)`}
      media={iconOf(c.name)}
      percent={Math.max(c.ratio * 100, 2)} valueLabel={`${c.share}%`}
      to={c.to} linkLabel={c.linkLabel} {...props} />
  )
  if (!bar.members) return row(bar)
  const n = bar.members.length
  return (
    <Box role="listitem">
      {row(bar, {
        role: undefined, onToggle: () => setOpen((o) => !o), expanded: open, controls: membersId,
        linkLabel: `${bar.name}: ${n} more categories`,
      })}
      <Stack id={membersId} role="list" aria-label={`In ${bar.name}`} spacing={4}
        display={open ? 'flex' : 'none'} mt={4} pl={4} ml={4} borderStartWidth="2px" borderColor="border.default">
        {bar.members.map((m) => <Fragment key={m.name}>{row(m)}</Fragment>)}
      </Stack>
    </Box>
  )
}

// The same breakdown as table rows: a folded "Other" lists its categories
// under it, indented (always shown — a table is for reading every figure).
export function CategoryTableRows({ bar, baseCurrency }) {
  const cells = (c, indent) => (
    <Tr key={`${indent ? 'member' : 'bar'}:${c.name}`}>
      <Td pl={indent ? 8 : undefined}>
        {c.to ? <Link as={RouterLink} to={c.to} aria-label={c.linkLabel}>{c.name}</Link> : c.name}
      </Td>
      <Td isNumeric fontWeight={indent ? '500' : '600'}>{formatMoney(c.value, baseCurrency)}</Td>
      <Td isNumeric color="text.muted">{c.share}%</Td>
    </Tr>
  )
  return <>{cells(bar, false)}{bar.members?.map((m) => cells(m, true))}</>
}
