import { useRef, useState } from 'react'
import {
  Button, HStack, Image, Text, Progress, Box, IconButton, useToast, VStack,
} from '@chakra-ui/react'
import { Camera, X } from 'lucide-react'
import { scanReceipt } from '../lib/receiptScan.js'

// Opens the phone's native camera, OCRs the photo on-device, and reports the
// extracted total + date (and the file) up to the parent to prefill the form.
export default function ReceiptScanner({ onScan }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const toast = useToast()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setBusy(true)
    setProgress(0)
    try {
      const { total, date } = await scanReceipt(file, setProgress)
      onScan?.({ file, total, date })
      if (total == null && date == null) {
        toast({ title: 'Couldn’t read the receipt — enter details manually.', status: 'warning' })
      } else {
        toast({
          title: 'Receipt scanned',
          description: [total != null && `total ${total}`, date && `dated ${date}`]
            .filter(Boolean).join(', '),
          status: 'success',
        })
      }
    } catch (err) {
      toast({ title: 'Scan failed', description: err.message, status: 'error' })
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    setPreview(null)
    onScan?.({ file: null, total: null, date: null })
  }

  return (
    <VStack align="stretch" spacing={3}>
      <input ref={inputRef} type="file" accept="image/*" capture="environment"
        hidden onChange={handleFile} />

      {!preview ? (
        <Button leftIcon={<Camera size={18} />} variant="outline"
          onClick={() => inputRef.current?.click()}>
          Scan a receipt
        </Button>
      ) : (
        <HStack align="start" spacing={3}>
          <Box position="relative">
            <Image src={preview} alt="Receipt" boxSize="64px" objectFit="cover" borderRadius="lg" />
            <IconButton aria-label="Remove receipt" icon={<X size={14} />} size="xs"
              position="absolute" top="-8px" right="-8px" borderRadius="full"
              onClick={clear} isDisabled={busy} />
          </Box>
          <Box flex="1">
            {busy ? (
              <>
                <Text fontSize="sm" color="text.muted" mb={1}>Reading receipt…</Text>
                <Progress value={progress * 100} size="sm" colorScheme="brand" borderRadius="full" />
              </>
            ) : (
              <Text fontSize="sm" color="text.muted">
                Receipt attached. Check the amount and date below, then save.
              </Text>
            )}
          </Box>
        </HStack>
      )}
    </VStack>
  )
}
