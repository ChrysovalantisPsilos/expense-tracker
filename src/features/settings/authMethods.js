// Pure helpers about how a user signs in. No Supabase calls — callers pass in
// the auth user / API responses they already have.

// True when the account has an email/password identity (so it has a password
// to change or re-enter). Defaults to true when the providers can't be read,
// so the stricter path — asking for the password — wins.
export function hasPasswordIdentity(user) {
  const meta = user?.app_metadata ?? {}
  const providers = meta.providers || (meta.provider ? [meta.provider] : [])
  return providers.includes('email') || providers.length === 0
}

// The passkey list API has returned both a bare array and `{ passkeys }`;
// normalize either to an array.
export function toPasskeyList(data) {
  return Array.isArray(data) ? data : (data?.passkeys ?? [])
}
