import { supabase } from './supabase.js'
import { dbError } from './errors.js'
import { isNative } from './platform.js'

// Web-push enrolment for payment reminders. The VAPID public key is not a
// secret (it ships in every push subscription); its private half lives in
// Supabase Vault and is only used by the send-reminders edge function.
const VAPID_PUBLIC_KEY =
  'BIYQfVeDa_M912mSOmd_6bK3OzRpP7UyvYa3fdJsC2LSGJ7I3HZe1-Yyiz81Y8I084Z8y7WelwyYWU0XI4l7qGE'

function urlBase64ToUint8Array(base64) {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

// Not in the iOS app: its web view has no service worker (Apple push comes
// in a later phase), so payment reminders stay in the in-app bell there.
export function pushSupported() {
  return !isNative() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// Ask permission (must be called from a user gesture — iOS requires it) and
// register this browser's push subscription server-side. Returns:
//   'subscribed'  — push will reach this device
//   'denied'      — user refused; reminders will still hit the in-app bell
//   'unsupported' — browser can't push (e.g. iOS Safari outside installed PWA)
export async function enablePush() {
  if (!pushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  const { keys } = sub.toJSON()
  // Definer-side RPC: reassigns the endpoint if it belonged to another account.
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth,
  })
  if (error) throw dbError(error)
  return 'subscribed'
}
