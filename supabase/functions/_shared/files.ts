// Sending a generated file (a PDF or Excel report) back to the app, the file
// types the app saves them as, and their names. The statements are made on the device
// now; the report functions below are its one-release fallback.
//
// The app calls the report functions through supabase.functions.invoke, which
// reads a response as a Blob only when its Content-Type is
// application/octet-stream or application/pdf. Any other type, the real xlsx
// type included, is read with response.text(): the zip is decoded as UTF-8
// and the saved workbook can't be opened. So a spreadsheet is sent as
// octet-stream, and the app gives the saved Blob its real type (FILE_TYPES).
// test/reportDownload.test.js runs a workbook through functions-js to check.

export const FILE_TYPES = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const

export type FileFormat = keyof typeof FILE_TYPES

// The personal statement's file name (the app's saved file, and the edge
// function's Content-Disposition).
export const statementFilename = (from: string, to: string, format: FileFormat): string =>
  `financial-statement_${from}_${to}.${format}`

// A filename-safe stem: runs of anything but ASCII letters/digits become a
// single '-', trimmed at the ends; falls back when nothing is left.
export function fileStem(name: unknown, fallback = 'file'): string {
  const stem = String(name ?? '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
  return stem || fallback
}

// The group statement's file name (the website's saved file, and the native
// app's, which shares the group-report function's PDF).
export const groupStatementFilename = (groupName: string): string => `${fileStem(groupName, 'group')}-statement.pdf`

// Only these types reach the app as bytes (functions-js's Blob branch).
const WIRE_TYPE: Record<FileFormat, string> = {
  pdf: FILE_TYPES.pdf,
  xlsx: 'application/octet-stream',
}

// A download response for `bytes`. `filename` is reduced to a safe
// Content-Disposition value (the app names the saved file itself).
export function fileResponse(bytes: Uint8Array, format: FileFormat, filename: string): Response {
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, '-')
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      'Content-Type': WIRE_TYPE[format],
      'Content-Disposition': `attachment; filename="${safe}"`,
    },
  })
}
