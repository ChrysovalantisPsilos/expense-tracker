// The in-app privacy request form (Settings → Privacy): which rights it can
// raise and how a request is checked. Shared by the form (re-exported from
// src/features/privacy/legal.js) and the privacy-request edge function, so
// both accept exactly the same thing. No imports: the unit tests load it.

export const REQUEST_KINDS: Record<string, string> = {
  restrict: 'Restrict processing (Art. 18)',
  object: 'Object to processing (Art. 21)',
  access: 'Access my data (Art. 15)',
  rectify: 'Correct my data (Art. 16)',
  erase: 'Erase my data (Art. 17)',
  portability: 'Data portability (Art. 20)',
  other: 'Other privacy question',
}

export const MESSAGE_MAX = 2000

// { kind, message } when the request is acceptable, else { error }.
export function validatePrivacyRequest(body: unknown): { kind: string; message: string } | { error: string } {
  const b = (body ?? {}) as { kind?: unknown; message?: unknown }
  const kind = typeof b.kind === 'string' ? b.kind : ''
  if (!Object.hasOwn(REQUEST_KINDS, kind)) return { error: 'Choose what your request is about.' }
  const message = typeof b.message === 'string' ? b.message.trim() : ''
  if (message.length < 10) return { error: 'Tell us a little more (at least 10 characters).' }
  if (message.length > MESSAGE_MAX) return { error: `Keep it under ${MESSAGE_MAX} characters.` }
  return { kind, message }
}
