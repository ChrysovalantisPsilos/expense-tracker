// App Store screenshots: the PNGs in ios/store/screenshots/<locale>/ (in
// file-name order, at most 10 per display size) replace a version
// localization's set when they differ from what is there. Apple's flow:
// reserve (POST appScreenshots with the name and size) → PUT each upload
// operation's bytes → commit (PATCH uploaded + the file's MD5).
//
// Display types (ScreenshotDisplayType): APP_IPHONE_67 is the 6.9"/6.7"
// slot (1320×2868, 1290×2796, 1260×2736), the one size an iPhone-only app
// must supply; APP_IPHONE_65 is the 6.5" one.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { STORE_DIR } from './listing.mjs'

export const SCREENSHOT_DIR = path.join(STORE_DIR, 'screenshots')
export const MAX_PER_SET = 10

const SIZES = {
  APP_IPHONE_67: [[1320, 2868], [1290, 2796], [1260, 2736]],
  APP_IPHONE_65: [[1284, 2778], [1242, 2688]],
}

export function displayTypeFor(width, height) {
  for (const [type, sizes] of Object.entries(SIZES)) {
    if (sizes.some(([w, h]) => (w === width && h === height) || (w === height && h === width))) return type
  }
  return null
}

// A PNG's size from its IHDR chunk.
export function pngSize(buffer) {
  const signature = '89504e470d0a1a0a'
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('not a PNG file')
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

export const md5 = (buffer) => createHash('md5').update(buffer).digest('hex')

// The local screenshots for one locale, grouped by display type.
export function localScreenshots(locale, dir = SCREENSHOT_DIR) {
  const folder = path.join(dir, locale)
  if (!existsSync(folder)) return {}
  const groups = {}
  for (const fileName of readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.png')).sort()) {
    const bytes = readFileSync(path.join(folder, fileName))
    const { width, height } = pngSize(bytes)
    const type = displayTypeFor(width, height)
    if (!type) throw new Error(`${locale}/${fileName} is ${width}×${height}, not an iPhone 6.9" or 6.5" screenshot size`)
    ;(groups[type] ??= []).push({ fileName, fileSize: bytes.length, checksum: md5(bytes), bytes })
  }
  for (const [type, files] of Object.entries(groups)) {
    if (files.length > MAX_PER_SET) throw new Error(`${locale}: ${files.length} screenshots for ${type} (at most ${MAX_PER_SET})`)
  }
  return groups
}

// Keep the set when it already holds the same files in the same order,
// fully delivered; otherwise replace it.
export function screenshotPlan(local, remote) {
  const same = local.length === remote.length && local.every((f, i) => {
    const r = remote[i].attributes ?? {}
    return r.fileName === f.fileName && r.sourceFileChecksum === f.checksum && r.assetDeliveryState?.state !== 'FAILED'
  })
  return same ? 'keep' : 'replace'
}

export function reserveBody(setId, file) {
  return {
    data: {
      type: 'appScreenshots',
      attributes: { fileName: file.fileName, fileSize: file.fileSize },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } },
    },
  }
}

export function commitBody(screenshotId, checksum) {
  return { data: { type: 'appScreenshots', id: screenshotId, attributes: { uploaded: true, sourceFileChecksum: checksum } } }
}

// The byte ranges Apple asked for, as fetch requests.
export function uploadRequests(operations, bytes) {
  return operations.map((op) => ({
    method: op.method,
    url: op.url,
    headers: Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value])),
    body: bytes.subarray(op.offset, op.offset + op.length),
  }))
}

// Upload one locale's screenshots to a version localization.
export async function syncScreenshots({ client, localizationId, locale, groups, log, fetchImpl = globalThis.fetch }) {
  const sets = await client.all(`/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`)
  for (const [displayType, files] of Object.entries(groups)) {
    let set = sets.find((s) => s.attributes?.screenshotDisplayType === displayType)
    if (!set) {
      set = (await client.post('/v1/appScreenshotSets', {
        data: {
          type: 'appScreenshotSets',
          attributes: { screenshotDisplayType: displayType },
          relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: localizationId } } },
        },
      })).data
    }
    const remote = await client.all(`/v1/appScreenshotSets/${set.id}/appScreenshots`)
    if (screenshotPlan(files, remote) === 'keep') {
      log(`Screenshots ${locale} ${displayType}: ${files.length} already there`)
      continue
    }
    for (const old of remote) await client.delete(`/v1/appScreenshots/${old.id}`)
    for (const file of files) {
      const reserved = (await client.post('/v1/appScreenshots', reserveBody(set.id, file))).data
      for (const req of uploadRequests(reserved.attributes.uploadOperations ?? [], file.bytes)) {
        const res = await fetchImpl(req.url, { method: req.method, headers: req.headers, body: req.body })
        if (!res.ok) throw new Error(`Uploading ${locale}/${file.fileName} failed (${res.status})`)
      }
      await client.patch(`/v1/appScreenshots/${reserved.id}`, commitBody(reserved.id, file.checksum))
    }
    log(`Screenshots ${locale} ${displayType}: uploaded ${files.length}`)
  }
}
