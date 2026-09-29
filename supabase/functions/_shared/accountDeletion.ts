// Deleting an account, server-side — shared by delete-account (the owner
// asks) and purge-inactive (24 months without use). `admin` is a
// service-role client. No imports: the unit tests can load this file.
//
// Owned groups are transferred to the earliest other linked member first (so
// they survive for everyone else), in one transaction by the
// transfer_owned_groups function (0099); groups where the user is the only
// linked member cascade-delete. The database does the rest when the auth
// user goes: personal rows cascade, and the anonymise_departing_user trigger
// (0072, 0078, 0080) turns the member rows, change-log names and the user's names in
// change-log texts into "Former member" before their user link is set to
// null, and deletes the notifications other people got about the user's
// actions (the only notifications that name a person).
//
// Storage isn't covered by the database cascade, so the user's files are
// removed through the Storage API first: their `avatars/<uid>/…` folder, and
// the cover image (`group-images/<group id>/…`) of every group that will
// cascade-delete with them. If that fails we stop before deleting the
// account, so a retry never leaves orphaned files behind.

// What deletion erases and what stays, in the words the delete dialog
// (settings/DeleteAccount.jsx) and the deletion confirmation emails
// (_shared/gdprEmails.ts) both use. Must stay true to deleteAccount below, the
// auth.users cascades and the 0072 anonymise trigger (and the Privacy
// Notice's "Erasure" and "Backups").
export const DELETION_SCOPE = {
  deleted: [
    'Your sign-in, passkeys, profile, picture and payment details',
    'Your expenses and income, categories and rules, accounts, budgets, goals and recurring payments',
    'Your notifications (and the ones other members got about something you did), push subscriptions, consent history and the group comments you wrote',
    'Groups you own that have no other members (the rest pass to another member)',
  ],
  stays: [
    'Group expenses, splits and settlements you were part of, so others’ balances stay right — shown as “Former member”, with no link to you',
  ],
  backups: 'Our database host keeps encrypted backups for a limited period, so deleted data disappears from them when they roll over.',
}

// deno-lint-ignore no-explicit-any
export async function deleteAccount(admin: any, uid: string): Promise<void> {
  // One transaction (0099): all shared groups handed over, or an error and
  // nothing deleted. A failed hand-over must never reach deleteUser, since
  // groups.owner_id cascades and would take a shared group with it.
  const { data: doomed, error: moveErr } = await admin.rpc('transfer_owned_groups', { p_user: uid })
  if (moveErr) throw moveErr
  const doomedGroups: string[] = doomed ?? []

  await removeFolder(admin, 'avatars', uid)
  for (const gid of doomedGroups) await removeFolder(admin, 'group-images', gid)

  const { error } = await admin.auth.admin.deleteUser(uid)
  if (error) throw error
}

// Delete every file under `<folder>/` in a bucket (paths are keyed by the
// owning user / group id, matching the storage RLS policies). Lists in pages
// of 100 until the folder is empty; entries without an id are sub-folder
// placeholders (our layouts are flat), and the pass count is bounded so a
// misbehaving listing can never spin forever.
// deno-lint-ignore no-explicit-any
async function removeFolder(admin: any, bucket: string, folder: string) {
  for (let pass = 0; pass < 100; pass++) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 })
    if (error) throw error
    const files = (data ?? []).filter((o: { id: string | null }) => o.id)
    if (!files.length) return
    const paths = files.map((o: { name: string }) => `${folder}/${o.name}`)
    const { error: rmErr } = await admin.storage.from(bucket).remove(paths)
    if (rmErr) throw rmErr
  }
}
