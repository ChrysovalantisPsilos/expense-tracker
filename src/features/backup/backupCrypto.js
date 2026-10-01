// Password protection for backup files, done entirely in the browser with
// WebCrypto (also `globalThis.crypto` in Node, so this is unit-tested there).
// The password never leaves the device and is never stored. How a file is
// sealed, and the checks an envelope must pass first, are backupMath's
// (SEAL, envelopeParams), which the native app follows with its own crypto.
//
// AES-GCM is authenticated: a wrong password and a damaged file both fail the
// tag check, and we can't (and don't try to) tell those apart.

import { UserError } from '../../shared/lib/errors.js'
import { t } from '../../shared/lib/i18n/i18n.js'
import {
  BACKUP_VERSION, SEAL, aadFor, backupText, envelopeParams, openedBackup, sealedFields, sealedText,
} from './backupMath.js'

// Built when thrown, so it's in the app's language at that moment.
const wrongPassword = () => new UserError(t('backup:errors.wrongPassword'))

const enc = new TextEncoder()
const dec = new TextDecoder()

// Base64 without spreading huge arrays into String.fromCharCode (a backup can
// be several MB, which would overflow the call stack in one go).
function toBase64(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function fromBase64(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: SEAL.hash, salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

// Encrypt `text` under `password`. `aad` (a short string, e.g. the file's
// format + version) is authenticated but not encrypted, so the plaintext
// header can't be swapped without breaking decryption.
// Returns { kdf, iv, ciphertext } with every binary field base64-encoded.
async function sealText(text, password, aad) {
  const salt = crypto.getRandomValues(new Uint8Array(SEAL.saltBytes))
  const iv = crypto.getRandomValues(new Uint8Array(SEAL.ivBytes))
  const key = await deriveKey(password, salt, SEAL.iterations)
  const params = { name: 'AES-GCM', iv, additionalData: enc.encode(aad) }
  const ct = new Uint8Array(await crypto.subtle.encrypt(params, key, enc.encode(text)))
  return sealedFields({ salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(ct) })
}

// Reverse of sealText for a backup's envelope (readBackup's): its parameters
// checked first (envelopeParams), then decrypted. Throws "Wrong password or
// damaged file." for a wrong password, a tampered/truncated file or
// malformed parameters.
async function openText(envelope, password) {
  const { iterations, salt, iv, ciphertext, aad } = envelopeParams(envelope)
  const key = await deriveKey(password, fromBase64(salt), iterations)
  try {
    const params = { name: 'AES-GCM', iv: fromBase64(iv), additionalData: enc.encode(aad) }
    return dec.decode(await crypto.subtle.decrypt(params, key, fromBase64(ciphertext)))
  } catch {
    throw wrongPassword()
  }
}

// The file's text: plain JSON, or the encrypted envelope when a password is set.
export async function serializeBackup(doc, password) {
  const text = backupText(doc)
  if (!password) return text
  return sealedText(await sealText(text, password, aadFor(BACKUP_VERSION)))
}

// Decrypt an envelope from readBackup and validate what's inside. A wrong
// password or a damaged file throws "Wrong password or damaged file."
export async function unlockBackup(envelope, password) {
  return openedBackup(await openText(envelope, password))
}
