import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Stack, HStack, Text, FormControl, FormLabel, Input, Select, Button, useToast,
  Box, IconButton, Tooltip, Checkbox,
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
import { memberName } from './groupFormat.js'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import PayShortcuts from './PayShortcuts.jsx'
import FormModal from '../../shared/ui/FormModal.jsx'

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

// Leave confirm; `onConfirm(silent)` — silent skips notifying the group.
export function LeaveGroupModal({ group, isOwner, isOpen, onClose, busy, onConfirm }) {
  const [silent, setSilent] = useState(false)
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Leave “{group.name}”?</ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            <Text color="text.muted">
              You can only leave once your balance is settled. Your past expenses
              stay in the group for everyone else.
              {isOwner && ' As the owner, ownership passes to another member.'}
            </Text>
            <Checkbox isChecked={silent} onChange={(e) => setSilent(e.target.checked)}>
              <Text fontSize="sm">Leave silently — don’t notify the group</Text>
            </Checkbox>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button colorScheme="red" isLoading={busy} onClick={() => onConfirm(silent)}>Leave</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

// Remove-member confirm (owner only); `member` null = closed.
export function RemoveMemberModal({ member, onClose, busy, onConfirm }) {
  return (
    <Modal isOpen={!!member} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Remove {member?.display_name}?</ModalHeader>
        <ModalBody>
          <Text color="text.muted">
            They can only be removed if settled up. If they’ve been part of any
            expenses, their history is kept.
          </Text>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button colorScheme="red" isLoading={busy} onClick={onConfirm}>Remove</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

const INVITE_STATUS_MESSAGE = {
  already_member: 'That person is already in this group.',
  already_invited: 'They already have a pending invite to this group.',
}

export function InviteEmailModal({ group, isOpen, onClose }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const { busy, run } = useAsyncSubmit()
  const emailRef = useRef(null)

  async function submit() {
    const addr = email.trim()
    if (!addr) return
    await run(async () => {
      // First try to invite an existing Budgeer user (in-app request).
      const status = await inviteExistingUser(group.id, addr)
      if (status === 'invited') {
        toast({ title: `Request sent to ${addr}`, description: 'They’ll see it in Budgeer.', status: 'success' })
        onClose(); setEmail('')
      } else if (status === 'no_account') {
        // No account yet — send an emailable join link.
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
      } else {
        toast({ title: INVITE_STATUS_MESSAGE[status] ?? 'Couldn’t send the invite.', status: 'error' })
      }
    })
  }

  return (
    <FormModal isOpen={isOpen} onClose={onClose} title="Invite by email" onSubmit={submit}
      busy={busy} submitLabel="Send invite" initialFocusRef={emailRef}>
      <FormControl isRequired>
        <FormLabel>Email address</FormLabel>
        <Input ref={emailRef} type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
      </FormControl>
    </FormModal>
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
  // Open on the form's first real choice rather than the first tabbable
  // element — that is the suggestion list's reminder bell, whose tooltip
  // would pop up the moment the dialog appears.
  const directionRef = useRef(null)

  const otherNet = balances?.get(otherId) ?? 0
  const otherName = others.find((m) => m.id === otherId)?.display_name ?? ''
  const nameOf = (id) => memberName(members, id)

  // Minimal set of transfers that settles the whole group; surface only the
  // ones the current user is part of, one tap to pre-fill the form.
  const myPlan = useMemo(() => {
    if (!myMember) return []
    return simplifyDebts(balances ?? new Map())
      .filter((t) => t.from === myMember.id || t.to === myMember.id)
  }, [balances, myMember])

  function applySuggestion(t) {
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

  async function submit() {
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
    <FormModal isOpen={isOpen} onClose={onClose} title="Settle up" onSubmit={submit}
      busy={busy} submitLabel="Record" submitProps={{ isDisabled: others.length === 0 }}
      initialFocusRef={directionRef}>
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
                      <Text flex="1" minW={0} overflowWrap="anywhere">
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
                      <Button size="xs" variant="ghost" onClick={() => applySuggestion(t)}>Use</Button>
                    </HStack>
                  )
                })}
              </Stack>
            </Box>
          )}
          <HStack spacing={2}>
            <Button ref={directionRef} flex="1" variant={direction === 'out' ? 'solid' : 'outline'}
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
    </FormModal>
  )
}

export function RenameGroupModal({ group, isOpen, onClose, onSaved }) {
  const toast = useToast()
  const [name, setName] = useState(group.name)
  const { busy, run } = useAsyncSubmit()
  const nameRef = useRef(null)
  useEffect(() => { if (isOpen) setName(group.name) }, [isOpen, group.name])

  async function submit() {
    if (!name.trim()) return
    await run(async () => {
      await renameGroup(group.id, name.trim())
      toast({ title: 'Group renamed', status: 'success' })
      onSaved?.(); onClose()
    })
  }

  return (
    <FormModal isOpen={isOpen} onClose={onClose} title="Rename group" onSubmit={submit}
      busy={busy} initialFocusRef={nameRef}>
      <FormControl isRequired>
        <FormLabel>Group name</FormLabel>
        <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} />
      </FormControl>
    </FormModal>
  )
}
