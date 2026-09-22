import { useEffect, useState } from 'react'
import {
  Card, CardBody, Stack, SimpleGrid, Button, FormControl, FormLabel, Input, useToast,
  Center, Spinner, Text,
} from '@chakra-ui/react'
import { Landmark } from 'lucide-react'
import { getMyPaymentInfo, savePaymentInfo } from '../profile/profile.js'
import CardHeader from '../../shared/ui/CardHeader.jsx'

// "Getting paid": the IBAN / Revolut tag friends see when settling up.
export default function PaymentCard({ user }) {
  const toast = useToast()
  const [iban, setIban] = useState('')
  const [revolut, setRevolut] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getMyPaymentInfo().then((data) => {
      if (!active) return
      setIban(data.payment_iban ?? '')
      setRevolut(data.payment_revolut ?? '')
      setLoaded(true)
    }).catch(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [user.id])

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await savePaymentInfo({
        iban: iban.replace(/\s+/g, '').toUpperCase() || null,
        revolut: revolut.replace(/^@/, '').trim() || null,
      })
      toast({ title: 'Payment details saved', status: 'success' })
    } catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setBusy(false) }
  }

  return (
    <Card><CardBody>
      <CardHeader icon={Landmark} title="Getting paid" mb={2} />
      <Text fontSize="sm" color="text.muted" mb={4}>
        Friends settling up with you see these as one-tap payment options —
        a bank QR for your IBAN and a Revolut link.
      </Text>
      {!loaded ? (
        <Center py={3}><Spinner size="sm" color="brand.500" /></Center>
      ) : (
        <Stack spacing={4} as="form" onSubmit={save}>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>IBAN</FormLabel>
              <Input value={iban} onChange={(e) => setIban(e.target.value)}
                placeholder="CY17 0020 0128 ..." autoComplete="off" />
            </FormControl>
            <FormControl>
              <FormLabel>Revolut tag</FormLabel>
              <Input value={revolut} onChange={(e) => setRevolut(e.target.value)}
                placeholder="@yourtag" autoComplete="off" />
            </FormControl>
          </SimpleGrid>
          <Button type="submit" size="sm" alignSelf="start" isLoading={busy}>Save</Button>
        </Stack>
      )}
    </CardBody></Card>
  )
}
