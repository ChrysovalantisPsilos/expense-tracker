import { useEffect, useRef, useState } from 'react'
import {
  Button, HStack, Image, Text, Progress, Box, IconButton, useToast, VStack, Stack,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, Spacer,
  FormControl, FormLabel, Input, Select,
} from '@chakra-ui/react'
import { Camera, X, RotateCw, ScanText } from 'lucide-react'
import { scanReceipt } from '../lib/receiptScan.js'
import { decodeImage, orientedCanvas, prepareForOcr } from '../lib/receiptImage.js'
import { CURRENCIES } from '../lib/currency.js'
import { useAsyncSubmit } from '../lib/useAsyncSubmit.js'
import FormModal from './FormModal.jsx'
import MoneyInput from './MoneyInput.jsx'
import { RingMark, RingSpinner } from './RingLoader.jsx'

const clamp01 = (v) => Math.min(1, Math.max(0, v))

// Opens the phone's camera, lets the user straighten/crop the photo, reads it
// on-device (the photo is never uploaded or saved), then shows what was read
// — merchant, date, total, currency — for the user to correct before it is
// reported up. API: onScan({ total, date, merchant, currency }) on confirm
// (total a number or null, date YYYY-MM-DD or null, merchant/currency a
// string or null); onScan({ file: null, total: null, date: null }) when the
// user removes the scanned receipt.
export default function ReceiptScanner({ onScan }) {
  const inputRef = useRef(null)
  const toast = useToast()
  const { busy, run } = useAsyncSubmit()
  const [stage, setStage] = useState('idle') // idle | crop | confirm | done
  const [image, setImage] = useState(null)   // decoded, EXIF-upright
  const [turns, setTurns] = useState(0)      // extra quarter turns by the user
  const [display, setDisplay] = useState(null) // data URL of the turned photo
  const [crop, setCrop] = useState(null)     // { x, y, w, h } fractions, or null
  const [progress, setProgress] = useState(0)
  const [fields, setFields] = useState({ merchant: '', date: '', total: '', currency: '' })
  const areaRef = useRef(null)
  const dragFrom = useRef(null)

  // Preview of the photo as it will be read (after the user's turns).
  useEffect(() => {
    if (!image) { setDisplay(null); return }
    setDisplay(orientedCanvas(image, turns, 1200).toDataURL('image/jpeg', 0.85))
  }, [image, turns])

  // Free the decoded bitmap when it's replaced or the scanner unmounts.
  useEffect(() => () => image?.close?.(), [image])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    try {
      setImage(await decodeImage(file))
      setTurns(0)
      setCrop(null)
      setStage('crop')
    } catch {
      toast({ title: 'That photo couldn’t be opened — try another one.', status: 'warning' })
    }
  }

  function pointAt(e) {
    const r = areaRef.current.getBoundingClientRect()
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }
  }
  function startCrop(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragFrom.current = pointAt(e)
    setCrop(null)
  }
  function moveCrop(e) {
    const a = dragFrom.current
    if (!a) return
    const b = pointAt(e)
    setCrop({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) })
  }

  async function read() {
    setProgress(0)
    await run(async () => {
      const canvas = prepareForOcr(image, { quarterTurns: turns, crop })
      const r = await scanReceipt(canvas, setProgress)
      setFields({
        merchant: r.merchant ?? '',
        date: r.date ?? '',
        total: r.total != null ? String(r.total) : '',
        currency: r.currency ?? '',
      })
      setStage('confirm')
    }, { errorTitle: 'Scan failed' })
  }

  function confirm() {
    const total = Number(fields.total)
    onScan?.({
      total: fields.total && total > 0 ? total : null,
      date: fields.date || null,
      merchant: fields.merchant.trim() || null,
      currency: fields.currency || null,
    })
    setStage('done')
  }

  function cancel() {
    setStage('idle')
    setImage(null)
  }

  function clear() {
    cancel()
    onScan?.({ file: null, total: null, date: null })
  }

  const set = (key) => (value) => setFields((f) => ({ ...f, [key]: value }))
  const nothingRead = !fields.merchant && !fields.date && !fields.total

  return (
    <VStack align="stretch" spacing={3}>
      <input ref={inputRef} type="file" accept="image/*" capture="environment"
        hidden onChange={handleFile} />

      {stage === 'done' && display ? (
        <HStack align="start" spacing={3}>
          <Box position="relative">
            <Image src={display} alt="Receipt" boxSize="64px" objectFit="cover" borderRadius="lg" />
            <IconButton aria-label="Remove receipt" icon={<X size={14} />} size="xs"
              position="absolute" top="-8px" right="-8px" borderRadius="full" onClick={clear} />
          </Box>
          <Text flex="1" fontSize="sm" color="text.muted">
            Receipt read on your device (the photo isn’t saved). Check the details below.
          </Text>
        </HStack>
      ) : (
        <Button leftIcon={<Camera size={18} />} variant="outline"
          onClick={() => inputRef.current?.click()}>
          Scan a receipt
        </Button>
      )}

      <Modal isOpen={stage === 'crop'} onClose={busy ? () => {} : cancel} isCentered size="lg"
        closeOnOverlayClick={!busy}>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Scan receipt</ModalHeader>
          <ModalBody>
            <Stack spacing={3}>
              <Text fontSize="sm" color="text.muted">
                Drag across the photo to crop to the receipt (optional), and turn it
                if it’s sideways. It’s read on this device — nothing is uploaded.
              </Text>
              {display && (
                // Shrink-wrapped to the photo, so crop fractions are fractions of the image.
                <Box ref={areaRef} position="relative" overflow="hidden" borderRadius="lg" w="fit-content"
                  maxW="100%" mx="auto" cursor="crosshair" userSelect="none" style={{ touchAction: 'none' }}
                  onPointerDown={busy ? undefined : startCrop} onPointerMove={moveCrop}
                  onPointerUp={() => { dragFrom.current = null }}
                  onPointerCancel={() => { dragFrom.current = null }}>
                  <Image src={display} alt="Receipt photo" display="block" maxW="100%" maxH="60vh"
                    draggable={false} />
                  {crop && (
                    <Box position="absolute" pointerEvents="none" borderWidth="2px" borderColor="brand.500"
                      left={`${crop.x * 100}%`} top={`${crop.y * 100}%`}
                      w={`${crop.w * 100}%`} h={`${crop.h * 100}%`}
                      boxShadow="0 0 0 9999px rgba(0, 0, 0, 0.45)" />
                  )}
                </Box>
              )}
              {busy && (
                <Box>
                  <HStack spacing={2.5} fontSize="sm" color="text.muted" mb={2}>
                    <RingMark size={20} />
                    <Text>Reading your receipt…</Text>
                  </HStack>
                  <Progress value={progress * 100} size="sm" aria-label="Reading receipt" />
                </Box>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter gap={2}>
            <IconButton aria-label="Turn 90°" variant="ghost" icon={<RotateCw size={18} />}
              isDisabled={busy} onClick={() => { setTurns((t) => t + 1); setCrop(null) }} />
            <Button variant="ghost" size="sm" isDisabled={busy || !crop} onClick={() => setCrop(null)}>
              Reset crop
            </Button>
            <Spacer />
            <Button variant="ghost" isDisabled={busy} onClick={cancel}>Cancel</Button>
            <Button leftIcon={<ScanText size={16} />} isLoading={busy} loadingText="Reading"
              spinner={<RingSpinner />} onClick={read}>
              Read receipt
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <FormModal isOpen={stage === 'confirm'} onClose={cancel} title="Check what was read"
        onSubmit={confirm} submitLabel="Use these"
        footerStart={<Button variant="ghost" onClick={() => setStage('crop')}>Back</Button>}>
        <Stack spacing={3}>
          <Text fontSize="sm" color="text.muted">
            {nothingRead
              ? 'Couldn’t read much from this photo — fill in what you can, or go back and crop closer.'
              : 'Correct anything that was misread, then use these details.'}
          </Text>
          <FormControl>
            <FormLabel fontSize="sm">Merchant</FormLabel>
            <Input value={fields.merchant} maxLength={120} onChange={(e) => set('merchant')(e.target.value)} />
          </FormControl>
          <HStack align="end">
            <FormControl>
              <FormLabel fontSize="sm">Total</FormLabel>
              <MoneyInput value={fields.total} onChange={set('total')} />
            </FormControl>
            <FormControl maxW="120px">
              <FormLabel fontSize="sm">Currency</FormLabel>
              <Select value={fields.currency} placeholder="—" onChange={(e) => set('currency')(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormControl>
          </HStack>
          <FormControl>
            <FormLabel fontSize="sm">Date</FormLabel>
            <Input type="date" value={fields.date} onChange={(e) => set('date')(e.target.value)} />
          </FormControl>
        </Stack>
      </FormModal>
    </VStack>
  )
}
