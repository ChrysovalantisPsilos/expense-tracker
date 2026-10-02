// Frees the development certificates earlier TestFlight runs made. Each run
// signs the archive on a fresh machine, so automatic signing makes a new
// "Apple Development: Created via API" certificate every time, and Apple stops
// at its limit ("Choose a certificate to revoke"). Before an archive this
// revokes those, and only those: never a person's own development
// certificate (Xcode on a Mac names it after them) and never a distribution
// one.
//
// Run by .github/workflows/ios-testflight.yml before the archive:
//   node scripts/asc/certificates.mjs
import { pathToFileURL } from 'node:url'
import { createClient } from './api.mjs'

const DEVELOPMENT = new Set(['DEVELOPMENT', 'IOS_DEVELOPMENT'])

// The certificates a run made: development ones named "Created via API".
export function runCertificates(certificates) {
  return certificates.filter((c) => DEVELOPMENT.has(c.attributes?.certificateType)
    && /Created via API/.test(`${c.attributes?.name ?? ''} ${c.attributes?.displayName ?? ''}`))
}

async function main() {
  const client = createClient({
    keyId: process.env.ASC_KEY_ID.trim(),
    issuerId: process.env.ASC_ISSUER_ID.trim(),
    privateKey: process.env.ASC_KEY_P8,
  })
  const stale = runCertificates(await client.all('/v1/certificates?limit=200'))
  for (const c of stale) await client.delete(`/v1/certificates/${c.id}`)
  console.log(`Development certificates from earlier runs revoked: ${stale.length}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.log(`::error::${e.message}`)
    process.exit(1)
  })
}
