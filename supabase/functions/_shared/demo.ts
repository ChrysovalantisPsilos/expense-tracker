// The shared demo account (profiles.is_demo, 0090). Anyone with its login can
// sign in, so the browser-called functions that delete an account or send
// email refuse it, with the same words the database uses for its refusals
// (errors.js SQL_USER_MESSAGES; test/demoAccount.test.js keeps them in step).

export const DEMO_REFUSAL = 'That isn’t available on the demo account.'

// Minimal shape of the caller-scoped client this needs (callerClient, http.ts).
type ProfileReader = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, v: string) => {
        maybeSingle: () => PromiseLike<{ data: { is_demo?: boolean } | null; error: unknown }>
      }
    }
  }
}

// Whether the signed-in caller is a demo account, read through the caller's
// own session (own-row RLS). Throws when the profile can't be read, so a
// caller fails closed.
export async function isDemoCaller(asUser: ProfileReader, uid: string): Promise<boolean> {
  const { data, error } = await asUser.from('profiles').select('is_demo').eq('id', uid).maybeSingle()
  if (error) throw error
  return data?.is_demo === true
}
