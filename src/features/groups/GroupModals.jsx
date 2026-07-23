import { useState, useEffect, useMemo } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Stack, HStack, Text, FormControl, FormLabel, Input, Select, Button, useToast,
  Box, Divider, IconButton, Tooltip,
} from '@chakra-ui/react'
import { ArrowRight, Wand2, BellRing } from 'lucide-react'
import {
  inviteExistingUser, createInvite, emailInvite, addSettlement, renameGroup,
  nudgeMember,
} from './groups.js'
import { toMinor, fromMinor, formatMoney } from '../../shared/lib/currency.js'
import { today } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { simplifyDebts } from './splitMath.js'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import PayShortcuts from './PayShortcuts.jsx'

export function DeleteGroupModal({ group, isOpen, onClose, busy, onConfirm }) {
  const [text, setText] = useState('')
  const match = text.trim() === group.name
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Delete “{group.name}”?</ModalHeader>
        <ModalBody>
          <Stack spacing={3}>
            <Text color="text.muted">
              This permanently deletes the group and all its expenses, balances,
              and settlements for <b>everyone</b> — and removes the shared
              expenses mirrored into members’ personal trackers. Only possible
              when everyone is settled up. This can’t be undone.
            </Text>
            <FormControl>
              <FormLabel fontSize="sm">Type the group name to confirm</FormLabel>
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={group.name} />
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button colorScheme="red" isDisabled={!match} isLoading={busy} onClick={onConfirm}>
            Delete group
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export function InviteEmailModal({ group, isOpen, onClose }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const addr = email.trim()
    if (!addr) return
    setBusy(true)
    try {
      // First try to invite an existing Budgeer user (in-app request).
      await inviteExistingUser(group.id, addr)
      toast({ title: `Request sent to ${addr}`, description: 'They’ll see it in Budgeer.', status: 'success' })
      onClose(); setEmail('')
    } catch (err) {
      if (err.message === 'no_account') {
        // No account yet — send an emailable join link.
        try {
          const { token, url } = await createInvite(group.id, { email: addr })
          try {
            await emailInvite({ to: addr, token })
            toast({ title: `Invite emailed to ${addr}`, status: 'success' })
          } catch (mailErr) {
            await navigator.clipboard.writeText(url)
            toast({ title: 'Couldn’t send the email — link copied instead',
              description: mailErr.message, status: 'warning', duration: 8000 })
          }
          onClose(); setEmail('')
        } catch (e2) {
          toast({ title: e2.message, status: 'error' })
        }
      } else {
        toast({ title: err.message, status: 'error' })
      }
    } finally { setBusy(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>Invite by email</ModalHeader>
        <ModalBody>
          <FormControl isRequired>
            <FormLabel>Email address</FormLabel>
            <Input type="email" autoFocus value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>Send invite</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

// Settle-up is always framed from the current user: they are one side of every
// settlement (payer or receiver), and pick the other member. Prevents
// arbitrary member-to-member entries.
export function SettleUpModal({ group, members, myMember, balances, isOpen, onClose, onSaved }) {
  const toast = useToast()
  const others = members.filter((m) => m.id !== myMember?.id)
  const [direction, setDirection] = useState('out') // 'out' = I paid, 'in' = they paid me
  const [otherId, setOtherId] = useState(others[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [settledAt, setSettledAt] = useState(() => today())
  const { busy, run } = useAsyncSubmit()

  const otherNet = balances?.get(otherId) ?? 0
  const otherName = others.find((m) => m.id === otherId)?.display_name ?? ''
  const nameOf = (id) => members.find((m) => m.id === id)?.display_name ?? '—'

  // Minimal set of transfers that settles the whole group; surface only the
  // ones the current user is part of, one tap to pre-fill the form.
  const myPlan = useMemo(() => {
    if (!myMember) return []
    return simplifyDebts(balances ?? new Map())
      .filter((t) => t.from === myMember.id || t.to === myMember.id)
  }, [balances, myMember])

  function useSuggestion(t) {
    if (t.from === myMember.id) { setDirection('out'); setOtherId(t.to) }
    else { setDirection('in'); setOtherId(t.from) }
    setAmount(String(fromMinor(t.amount, group.currency)))
  }

  async function nudge(memberId) {
    try {
      await nudgeMember(group.id, memberId)
      toast({ title: 'Reminder sent', status: 'success' })
    } catch (e) { toast({ title: e.message, status: 'info' }) }
  }

  async function submit(e) {
    e.preventDefault()
    if (!otherId) return toast({ title: 'Pick a person', status: 'warning' })
    if (!amount || Number(amount) <= 0) return toast({ title: 'Enter an amount', status: 'warning' })
    const from = direction === 'out' ? myMember.id : otherId
    const to = direction === 'out' ? otherId : myMember.id
    await run(async () => {
      await addSettlement({
        groupId: group.id, fromMember: from, toMember: to,
        amountMinor: toMinor(amount, group.currency), currency: group.currency, settledAt,
      })
      toast({ title: 'Settlement recorded', status: 'success' })
      onSaved?.(); onClose(); setAmount('')
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>Settle up</ModalHeader>
        <ModalBody>
          {others.length === 0 ? (
            <Text color="text.muted">Add another member first.</Text>
          ) : (
            <Stack spacing={4}>
              {myPlan.length > 0 && (
                <Box borderWidth="1px" borderColor="border.default" borderRadius="lg" p={3}>
                  <HStack mb={2} color="accent.fg">
                    <Wand2 size={15} />
                    <Text fontSize="sm" fontWeight="600">Suggested to settle up</Text>
                  </HStack>
                  <Stack spacing={1.5}>
                    {myPlan.map((t, i) => {
                      const iPay = t.from === myMember.id
                      return (
                        <HStack key={i} fontSize="sm">
                          <Text noOfLines={1} flex="1">
                            {iPay
                              ? <>Pay <b>{nameOf(t.to)}</b> {formatMoney(t.amount, group.currency)}</>
                              : <><b>{nameOf(t.from)}</b> pays you {formatMoney(t.amount, group.currency)}</>}
                          </Text>
                          {!iPay && members.find((m) => m.id === t.from)?.user_id && (
                            <Tooltip label="Send them a reminder">
                              <IconButton aria-label="Nudge to settle" size="xs" variant="ghost"
                                icon={<BellRing size={13} />} onClick={() => nudge(t.from)} />
                            </Tooltip>
                          )}
                          <Button size="xs" variant="ghost" onClick={() => useSuggestion(t)}>Use</Button>
                        </HStack>
                      )
                    })}
                  </Stack>
                </Box>
              )}
              <HStack spacing={2}>
                <Button flex="1" variant={direction === 'out' ? 'solid' : 'outline'}
                  colorScheme={direction === 'out' ? 'brand' : 'gray'}
                  onClick={() => setDirection('out')}>I paid</Button>
                <Button flex="1" variant={direction === 'in' ? 'solid' : 'outline'}
                  colorScheme={direction === 'in' ? 'brand' : 'gray'}
                  onClick={() => setDirection('in')}>I received</Button>
              </HStack>

              <FormControl isRequired>
                <FormLabel>{direction === 'out' ? 'Paid to' : 'Received from'}</FormLabel>
                <Select value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                  {others.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                </Select>
                {otherId && (
                  <Text fontSize="xs" color="text.muted" mt={1}>
                    {otherNet === 0 ? `${otherName} is settled up`
                      : otherNet > 0 ? `${otherName} is owed ${formatMoney(otherNet, group.currency)} overall`
                      : `${otherName} owes ${formatMoney(-otherNet, group.currency)} overall`}
                  </Text>
                )}
              </FormControl>

              <HStack align="end" justify="center" color="text.muted" fontSize="sm">
                <Text fontWeight="600" color="text.primary">
                  {direction === 'out' ? 'You' : otherName || '—'}
                </Text>
                <ArrowRight size={16} />
                <Text fontWeight="600" color="text.primary">
                  {direction === 'out' ? otherName || '—' : 'You'}
                </Text>
              </HStack>

              <HStack>
                <FormControl isRequired>
                  <FormLabel>Amount ({group.currency})</FormLabel>
                  <MoneyInput value={amount} onChange={setAmount} />
                </FormControl>
                <FormControl maxW="160px">
                  <FormLabel>Date</FormLabel>
                  <Input type="date" value={settledAt} onChange={(e) => setSettledAt(e.target.value)} />
                </FormControl>
              </HStack>

              {direction === 'out' && otherId && Number(amount) > 0 && (
                <PayShortcuts
                  member={others.find((m) => m.id === otherId)}
                  amountMinor={toMinor(amount, group.currency)}
                  currency={group.currency}
                  groupName={group.name}
                />
              )}
            </Stack>
          )}
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy} isDisabled={others.length === 0}>Record</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export function RenameGroupModal({ group, isOpen, onClose, onSaved }) {
  const toast = useToast()
  const [name, setName] = useState(group.name)
  const { busy, run } = useAsyncSubmit()
  useEffect(() => { if (isOpen) setName(group.name) }, [isOpen, group.name])

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    await run(async () => {
      await renameGroup(group.id, name.trim())
      toast({ title: 'Group renamed', status: 'success' })
      onSaved?.(); onClose()
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>Rename group</ModalHeader>
        <ModalBody>
          <FormControl isRequired>
            <FormLabel>Group name</FormLabel>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>Save</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
