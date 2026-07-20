import { useState, useEffect } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Stack, HStack, Text, FormControl, FormLabel, Input, Select, Button, useToast,
} from '@chakra-ui/react'
import { ArrowRight } from 'lucide-react'
import {
  inviteExistingUser, createInvite, emailInvite, addSettlement, renameGroup,
} from '../../lib/groups.js'
import { toMinor, formatMoney } from '../../lib/currency.js'
import MoneyInput from '../MoneyInput.jsx'

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
      // First try to invite an existing Budge user (in-app request).
      await inviteExistingUser(group.id, addr)
      toast({ title: `Request sent to ${addr}`, description: 'They’ll see it in Budge.', status: 'success' })
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
  const [settledAt, setSettledAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  const otherNet = balances?.get(otherId) ?? 0
  const otherName = others.find((m) => m.id === otherId)?.display_name ?? ''

  async function submit(e) {
    e.preventDefault()
    if (!otherId) return toast({ title: 'Pick a person', status: 'warning' })
    if (!amount || Number(amount) <= 0) return toast({ title: 'Enter an amount', status: 'warning' })
    const from = direction === 'out' ? myMember.id : otherId
    const to = direction === 'out' ? otherId : myMember.id
    setBusy(true)
    try {
      await addSettlement({
        groupId: group.id, fromMember: from, toMember: to,
        amountMinor: toMinor(amount, group.currency), currency: group.currency, settledAt,
      })
      toast({ title: 'Settlement recorded', status: 'success' })
      onSaved?.(); onClose(); setAmount('')
    } catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setBusy(false) }
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
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (isOpen) setName(group.name) }, [isOpen, group.name])

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await renameGroup(group.id, name.trim())
      toast({ title: 'Group renamed', status: 'success' })
      onSaved?.(); onClose()
    } catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setBusy(false) }
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
