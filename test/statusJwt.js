// Test helper (not a test file): an RSA key pair and RS256 signing, standing
// in for Cloudflare Access so the admin checks can be exercised end to end.
export async function signingKey(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'])
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey)
  return { kid, privateKey: pair.privateKey, jwk: { kid, kty: 'RSA', alg: 'RS256', use: 'sig', n: pub.n, e: pub.e } }
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')

export async function signJwt(key, claims, header = {}) {
  const input = `${b64({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...header })}.${b64(claims)}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(input))
  return `${input}.${Buffer.from(sig).toString('base64url')}`
}
