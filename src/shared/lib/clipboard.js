// Copying text, including text that only exists after an await (an invite
// link the server has to create first).
//
// Browsers only allow a clipboard write inside the user's tap. Safari on
// iPhone ends that permission at the first await, so `await createLink()`
// followed by `writeText()` fails there with NotAllowedError. The fix is to
// start the write during the tap and hand the browser a promise of the text:
// a ClipboardItem whose value is still being fetched. Where that isn't
// supported (or the browser refuses anyway) it falls back to writeText.
//
// Resolves true when the text is on the clipboard, false when every way was
// refused. It never throws for a clipboard refusal; a rejected `value` (the
// link couldn't be created) is the caller's to handle by awaiting it too.

export async function copyText(value, clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard) return false
  const text = Promise.resolve(value)
  if (typeof clipboard.write === 'function' && typeof globalThis.ClipboardItem === 'function') {
    try {
      const blob = text.then((t) => new Blob([String(t)], { type: 'text/plain' }))
      await clipboard.write([new globalThis.ClipboardItem({ 'text/plain': blob })])
      return true
    } catch {
      // Not supported, or refused: try the plain way below.
    }
  }
  try {
    await clipboard.writeText(String(await text))
    return true
  } catch {
    return false
  }
}
