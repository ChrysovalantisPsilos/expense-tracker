// Password protection for backup files, done entirely in the browser with
// WebCrypto (also `globalThis.crypto` in Node, so this is unit-tested there).
// The password never leaves the device and is never stored.
//
//   key  = PBKDF2-SHA256(password, random 16-byte salt, ITERATIONS) → AES-GCM-256
//   data = AES-GCM(key, random 12-byte IV, plaintext, additionalData = AAD)
//
// AES-GCM is authenticated: a wrong password and a damaged file both fail the
// tag check, and we can't (and don't try to) tell those apart.

const ITERATIONS = 600_000 // OWASP 2023 guidance for PBKDF2-SHA256
// Bounds for a file's own iteration count: refuse absurd values rather than
// hang the tab (or accept a weakened file) on a crafted input.
const MIN_ITERATIONS = 310_000
const MAX_ITERATIONS = 5_000_000

const WRONG_PASSWORD = 'Wrong password or damaged file.'

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
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new Error(WRONG_PASSWORD)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

// Encrypt `text` under `password`. `aad` (a short string, e.g. the file's
// format + version) is authenticated but not encrypted, so the plaintext
// header can't be swapped without breaking decryption.
// Returns { kdf, iv, ciphertext } with every binary field base64-encoded.
export async function sealText(text, password, { aad } = {}) {
  const iterations = ITERATIONS
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, iterations)
  const params = { name: 'AES-GCM', iv, ...(aad ? { additionalData: enc.encode(aad) } : {}) }
  const ct = new Uint8Array(await crypto.subtle.encrypt(params, key, enc.encode(text)))
  return {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    iv: toBase64(iv),
    ciphertext: toBase64(ct),
  }
}

// Reverse of sealText. Throws Error(WRONG_PASSWORD) for a wrong password,
// a tampered/truncated file or malformed parameters.
export async function openText({ kdf, iv, ciphertext } = {}, password, { aad } = {}) {
  const iterations = kdf?.iterations
  if (kdf?.name !== 'PBKDF2' || kdf?.hash !== 'SHA-256' || !Number.isInteger(iterations)
    || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error(WRONG_PASSWORD)
  }
  const salt = fromBase64(kdf.salt)
  const ivBytes = fromBase64(iv)
  if (salt.length < 16 || ivBytes.length !== 12) throw new Error(WRONG_PASSWORD)
  const key = await deriveKey(password, salt, iterations)
  try {
    const params = { name: 'AES-GCM', iv: ivBytes, ...(aad ? { additionalData: enc.encode(aad) } : {}) }
    return dec.decode(await crypto.subtle.decrypt(params, key, fromBase64(ciphertext)))
  } catch {
    throw new Error(WRONG_PASSWORD)
  }
}
