# Budgeer end-to-end encryption plan

## 1. Chosen approach

**Chosen: "Sealed ledger".** Everything that only you see is encrypted on your device. Groups stay encrypted on the server for now and get their own plan later.

It ranked first on both security and delivery. It makes a real end-to-end claim for personal data, ships in small phases, and keeps web and iOS the same. The full design, which also covers groups, was scored lower: it would take 4–6 months and makes groups worse for users (waiting for approval, blocked writes, balances that can drift between apps). The "locked at rest" design sends your key to the server on every request, so it is not end-to-end encryption.

**Added from the other designs:**
- **From the full design:**
  - **Row binding.** Each encrypted value is tied to its row and column, so the server cannot move or replay it.
  - **Device linking.** Add a new device with a QR code or short code from a device you already have.
  - **Identity key.** A per-user key pair is created at sign-up now, so the later groups plan needs no second enrolment.
  - **Optional Face ID gate.** The iOS key can require Face ID.
  - **Resumable migration.** Progress is saved, and a banner shows it while you keep using the app.
  - **Old import ids kept.** `client_uuid_legacy` stays for one release so re-imports still de-duplicate.
  - **Group balance fixtures.** Today's SQL group balances are recorded now as test fixtures for the later groups work.
  - **Encryption settings logic** in a shared pure module, `e2eeSettingsMath.js`.
- **From the locked-at-rest design:**
  - A Phase 0 spike to check the risky parts first.
  - `docs/ENCRYPTION.md`, with the threat model and the exact public wording.
  - Your own copy of your payment details is encrypted early.
  - A check that fails if logging could capture sensitive values.
  - Explicit file protection on the iOS caches and the widget snapshot.
- **New in this plan:**
  - Each device remembers that an account is encrypted. The server cannot quietly switch it back to plaintext.
  - Once a device has enrolled, it refuses to send plaintext writes.

**Glossary:**
- **AK (account key):** one random key per user. It is made on the device and never sent to the server unencrypted.
- **Wrap:** a copy of the AK locked with another key (recovery key, passkey, device key). The server stores wraps but cannot open them.
- **AAD:** extra data glued to each encrypted value (table, column, row id, owner). If it does not match, decryption fails, so a value cannot be moved to another row.
- **HMAC:** a hash that needs a secret key. Without the key, nobody can test guesses against it.
- **PRF:** a passkey feature that gives the device a secret the server never sees.
- **CSP:** a browser rule that blocks injected scripts.

## 2. What gets end-to-end encryption and what does not

**Encrypted on the device with the AK** (one sealed JSON per row, AES-GCM-256):

| Table | What is sealed |
| --- | --- |
| `transactions` (personal rows, where `group_expense_id` is null) | amount, description, notes |
| `recurring_rules` | amount, description |
| `budgets` | the cap |
| `accounts` | name, balance (the name is plaintext today) |
| `savings_goals` | name, target, saved (the name is plaintext today) |
| `categories` | name (plaintext today). icon, colour, kind, `default_key` and `is_savings` stay plain |
| `category_rules` | pattern (plaintext today; it shows the merchants you use) |
| Documents | `recurring_plans`, `recurring_plan_undo`, `meal_vouchers`, `salary_history`, `ai_month_summaries` |
| `profiles.payment_*_enc` | your own copy of your IBAN, Revolut and PayPal details (retires `payment_enc_key()`, 0046, for this copy) |
| `transactions.client_uuid` | becomes an HMAC with a key taken from the AK. Today it is a plain SHA-256 that someone holding the database could guess |

**Stays readable by the server.** This is accepted metadata, listed in `docs/GDPR.md` and `docs/ENCRYPTION.md`:
- **Ids and links:** row ids, `user_id`, `category_id`, `account_id`, `recurring_rule_id`.
- **Entry details:** `kind`, `currency`, `exchange_rate`, `spent_at`, `spread_months`, the savings and voucher flags. FX filling and ordering need these.
- **Recurring schedule:** `frequency`, `interval_n`, `next_run`, `end_date`, `remind_days_before`, `is_active`. Reminders and the nightly job need these.
- **Budgets:** `budgets.period_start`, for rollover.
- **Profile:** display name, avatar, email, base currency, language, salary-shift settings and the switches.
- **Delivery and operations:** push tokens, consents, rate limits and FX tables.
- **All group data, for now:** group names, member names, expenses, splits, settlements, comments, the audit log, and the server-side mirror rows of your group shares in `transactions`. Also the copy of your payment details that group members see.
- **Anything sent to the optional helpers.** Type it, Import category ideas, the month In words and Plan What-if send the data they need per request, only when their switch is on.

**Public wording** (store listing `ios/store/listing.*.json`, privacy notice, in-app text):

> "Your personal amounts, notes and names are end-to-end encrypted. Group data is encrypted on our servers."

Do not claim more than this.

## 3. Key management and recovery

**Keys:**
- **AK.** Random 32 bytes per user, made on the device. Sign-in stays as it is today: password, Google, Apple, passkey. Unlocking your data is a separate step, so all four sign-in methods work the same way.
- **Sub-keys.** Made from the AK: one for the `client_uuid` HMAC.
- **Identity key pair (X25519).** Created at enrolment. The private half is sealed under the AK and the public half is stored plain. It is not used until the groups plan.

**Ways to unlock** (each one is a wrap row):

| Factor | Required? | Web | iOS |
| --- | --- | --- | --- |
| Recovery key (32 bytes, shown once as a code) | Yes | Download as a file; you type back its last groups to confirm | Share sheet; same check |
| Device key (daily unlock) | On every device | A non-extractable key in IndexedDB (`src/shared/lib/e2ee/keyStore.js`); never in localStorage. Optional re-unlock after N days | Keychain item, `AfterFirstUnlockThisDeviceOnly` (same pattern as `App/PinKeychain.swift`); optional Face ID gate through `AppLock` |
| Passkey PRF | Optional | Added to `signInWithPasskey` (`AuthProvider.jsx` ~l.250), or a second passkey prompt that stays on the device if supabase-js cannot pass it through | iOS 18+ through `Passkeys.swift`; iOS 17 falls back to other factors |
| Device linking (QR or 8-digit code) | Optional | New device shows the code; a signed-in device approves | Same |
| Encryption passphrase | Optional | `backupMath.SEAL` format (PBKDF2 600k); never the login password | Same through `BackupSeal`-style code |

**Shared code, so web and iOS behave the same:**
- **Pure core modules** in `src/shared/lib/e2ee/`:
  - `envelope.js`: the format, versions and error messages.
  - `aad.js`: binds table, column, row id and owner. One exception: `(user, 'rule-amount')` for the copy from `recurring_rules` to `transactions` that `materialize_recurring_rules` makes.
  - `sealedRows.js`: which fields each table seals, and turning rows into sealed form and back.
  - `e2eeSettingsMath.js`: the logic behind the Settings screen.
  - All are added to `mobile-core/modules.js`. Test vectors go into `ios/BudgeerCore/vectors.json` (`npm run core:vectors`) so both platforms produce identical bytes.
- **Native crypto calls only:**
  - Web: `src/shared/lib/e2ee/webCrypto.js` (WebCrypto).
  - iOS: `Budgeer/Crypto/E2EECrypto.swift` (CryptoKit), modelled on `Backup/BackupSeal.swift`.
  - No crypto library is added to `CORE_PACKAGES`.

**Lifecycle:**
- **Sign-out** deletes the device key, next to the cache wipes in `AuthProvider.signOut` and `SessionStore`/`WidgetSync`.
- **Forgot password** resets sign-in only. The copy says so on the web (`Login.jsx`) and on iOS (`AccountPages`, `ResetPasswordModel`). The reset then leads to "Unlock your data".
- **Removing a passkey** also deletes its wrap.
- **Settings → Security → Encryption** on both platforms lists devices, passkeys and the recovery key. It also offers "Show a new recovery key", "Remove device" and "Link a device".
- **If every factor is lost:** "Reset encryption" deletes your personal encrypted data. The account and your groups stay. Support cannot recover the data. The FAQ (`faqContent`) and `docs/GDPR.md` say this plainly.
- **Downgrade protection:** each device stores "this account is encrypted". If the server later says "off", the app warns you and does not send plaintext.

**Web prerequisite:** a strict CSP in `vercel.json` (no inline scripts). With E2EE, one injected script could use the key while the page is open.

## 4. Groups

Groups stay on today's server-side encryption in this plan. Only the changes needed for personal and group data to sit side by side are made:

1. **Two kinds of rows in `transactions`.** Mirror rows (`group_expense_id` not null), written by `sync_group_share`/`sync_group_expense_meta` (0062/0064), stay under `app_enc_key()`. A CHECK enforces one scheme per row. `my_transactions` returns decrypted columns for mirror rows and the sealed value for personal rows. One merge function in `sealedRows` (web `shared/lib/transactions.js`, iOS `SupabaseStore`) turns both into the same row shape, so Home, Activity, Budgets and the widgets do not change.
2. **These keep running in SQL:** `_group_net`/`group_balances`, `group_ledger`, `my_group_flow` (0110), the split-sum checks in `create_group_expense_v2`/`update_group_expense_v2`, `log_group_expense`, `anonymise_departing_user`, `member_payment_info` and `group-report`.
3. **Group notifications** must never include a personal category name. Audit `notify_group_expense` (0050) and `notify_fanout` (0043).
4. **Payment details.** Your own copy is sealed. A server-encrypted copy for your groups exists only if you share your details with them, and the UI says so.
5. **Preparation for the later groups plan:**
   - The identity key already exists from enrolment.
   - The per-row scheme column is already in place.
   - Parity fixtures from today's SQL balances are recorded into `Fixtures/groups.json` and `test/groupBalance.test.js`.
   - The later plan adds a key per group, client-side balances, invites that carry the key, safety-number checks, and a rule for members who never update.

## 5. What happens to each server feature

| Feature | Fate | Notes |
| --- | --- | --- |
| Personal reads (`my_transactions`, `my_recurring_rules`, `my_budgets`, `my_accounts`, `my_goals`, `my_recurring_plan`, `my_meal_vouchers`, `my_salary_history`, `my_payment_info`) | Kept | Return sealed values; the device decrypts |
| Personal writes (`save_transactions`, `update_transaction`, `save_recurring_rule`, `save_budget`, `save_account`, `save_goal`, document saves) | Kept as `*_sealed` versions | Old plaintext versions refuse encrypted accounts. Canonical copies stay in `supabase/sql/functions/` |
| `materialize_recurring_rules` (nightly) | Kept | Copies the sealed value as is (rule-amount AAD) |
| `fx_sync` / `fx_apply_pending` | Kept | Use metadata only |
| `send-reminders` | Kept | Already uses plain schedule columns only |
| `notify_budget_threshold` | Moved to device | New pure `budgetAlertMath` plus a rate-limited `notify_self_budget` RPC with generic text. Alerts from group shares arrive when you next open the app |
| `send_weekly_digests` | Dropped (content) | Becomes a generic "Your week is ready"; the app works out the figures |
| `apply_recurring_plan` / `undo_recurring_plan` (0095/0107) | Moved to device | `apply_recurring_plan_sealed` writes the client-built rows and the undo blob in one step |
| Shape checks (`recurring_plan_check`, `meal_vouchers_check`, `salary_history_check`) | Moved to device | The server checks size only |
| Import-rule normalisation (0093 trigger) | Moved to device | Into `importRulesMath` |
| `generate-report` (personal statement) | Moved to device | Web already uses `deviceStatement.js`; iOS moves to the same code through mobile-core `callBytes`. Then the function is deleted |
| `export_my_data` (GDPR export) | Moved to device | The server returns sealed values; the privacy page and `PrivacyModel` build the file |
| Backup restore (`backupMath`) | Moved to device | Gains a "seal rows" step |
| Import de-duplication | Moved to device | HMAC `client_uuid`; `client_uuid_legacy` kept for one release |
| Helpers: month In words (`ai_month_totals` 0109) | Sent per request | The device computes the facts (`monthFacts` as shared JS) and sends them. `ai_month_totals` refuses encrypted accounts |
| Helpers: Type it, Import ideas, What-if | Sent per request | The device sends category names, lines and rules. The server stops reading `my_recurring_rules` and `categories` |
| `ai_save_month_summary` | Moved to device | The device seals the text and stores it |
| Notification text and push | Kept, content-free | No category names for encrypted accounts |
| All group RPCs, triggers and `group-report` | Kept | Server-encrypted (see section 4) |
| `send-invite`, privacy emails, `operator-digest`, `purge-inactive`, account deletion | Kept | Metadata only |
| `demo_seed` / `demo_wipe` | Kept | Demo and reviewer accounts cannot enrol (`refuse_if_demo` plus an allowlist) |
| Offline caches (`src/sw.js`, iOS `QueryCache`) | Kept | Now hold sealed values. iOS sets `NSFileProtectionComplete`; the widget snapshot is a documented exception |

## 6. Migrating existing users

- **Driven by the device, resumable, one device at a time.**
- **States:** `profiles.e2ee_state` moves 'off' → 'migrating' → 'on'. `profiles.e2ee_progress` stores where the migration has got to.
- **Steps:**
  1. You enable encryption and save your recovery key. The device writes its wraps. `e2ee_begin()` sets 'migrating'.
  2. The device pages through the old reads (`paginate.js`), seals 500 rows at a time and calls `e2ee_migrate_batch`. That function only touches your rows that have `group_expense_id` null, nulls the old columns, and rewrites `client_uuid` as the HMAC. Rows already sealed are skipped, so a crash just resumes.
  3. A banner shows "Securing your data… 40%". The app stays usable.
  4. `e2ee_finish()` checks that nothing personal is left in the old form and sets 'on'. The plaintext RPCs then refuse that account.
- **Old app versions** see "Update Budgeer" through a minimum-version check on web load and on iOS launch.
- **After migration:**
  - Offline caches are wiped.
  - Supabase point-in-time backups keep old server-readable copies until their retention ends. Write this in `docs/GDPR.md`.
- **New accounts:** after release, onboarding (`onboardingMath`, `OnboardingView`) offers encryption before any data exists.

## 7. Roadmap

Each phase ships to TEST, then PROD, on web and iOS together. Each phase has its own strings in `src/locales/{en,el}` (`npm run ios:strings`), iOS snapshots, unit tests and DB tests. Until Phase 6, enrolment is limited to `is_developer` accounts.

| Phase | Ships | Migration and DB tests | Effort |
| --- | --- | --- | --- |
| **0. Spike** | Check passkey PRF through supabase-js and on iOS 18, strict CSP in `vercel.json`, Safari storage eviction, and decrypting 5k rows in JavaScriptCore. Write `docs/ENCRYPTION.md`. Add the log-settings check | None | 3–5 days |
| **1. Move plaintext consumers to the device (no crypto yet)** | iOS statement through mobile-core; facts computed on the device for the month In words; `budgetAlertMath` + `notify_self_budget`; Plan apply/undo on the device; GDPR export on the device; group balance fixtures recorded | 0111; tests 121–122 | 1.5–2 weeks |
| **2. Keys, enrolment, unlock** | `key_wraps`, `user_keys` (identity key), `device_link_requests`, `e2ee_state`/`e2ee_progress`; envelope core and vectors; recovery key screen, unlock screen, device linking, Settings → Encryption, forgot-password text, CSP live. Nothing is sealed yet | 0112; tests 123–127 (per-verb RLS, forced `user_id`, rate limits, demo refusal) | 3–3.5 weeks (riskiest) |
| **3. Small objects and documents** | Budgets, accounts, goals, plan, undo, vouchers, salary, the month summary, your own payment details. The budget trigger skips encrypted accounts; `ai_month_totals` refuses them | 0113; tests 128–131 | ~1 week |
| **4. Categories and import rules** | `name_sealed`, `pattern_sealed`; default categories named on the device; generic digest | 0114; tests 132–133 | ~1 week |
| **5. Ledger and recurring rules** | Sealed `transactions`/`recurring_rules`, mixed rows with mirror rows, HMAC `client_uuid`, the seal step in restore, ciphertext caches, widget file protection | 0115; tests 134–139 | 2–3 weeks |
| **6. Migration and release** | Resumable migration with the banner, version gate, downgrade (if chosen), docs (`GDPR.md`, `TESTING.md`, FAQ, privacy notice, store listing), What's new entry, `generate-report` removed | 0116; tests 140–141 | 1.5–2 weeks |

**Total:** about 11–14 weeks. The later groups plan adds about 6–8 weeks.

## 8. Risks

1. **Permanent loss.** If every factor is lost, the data is gone. Mitigations: the recovery key is required and checked, and linking, passkey and passphrase are optional extra factors.
2. **Web script injection.** An injected script could use the key while the page is open. The strict CSP and the existing "no `dangerouslySetInnerHTML`" rule are the defence.
3. **Safari eviction.** Safari can delete stored data for a PWA that is not installed after 7 days. You then unlock again.
4. **Uneven passkey PRF support.** iOS 17, Firefox and some security keys do not support it fully.
5. **Two row kinds in `transactions`.** A reader that misses the merge shows blanks. Mitigation: one shared merge function and the iOS parity fixtures.
6. **Lost server checks.** Late budget alerts for group shares and other devices. Documents are checked by size only on the server.
7. **Users may read "end-to-end" too broadly.** Groups and metadata stay server-readable. The public wording must be exact.
8. **The helpers are a deliberate gap.** They are allowed only behind their switches, with clear text.
9. **Old backups.** Point-in-time backups and past logs hold old server-readable data for their retention window.
10. **Migration on live accounts.** Two devices, old app versions, crashes. Handled by the states, idempotent batches and the version gate. Needs careful testing on TEST.
11. **App Review.** Reviewer accounts must never meet an unlock step. The allowlist must be applied on both projects.
12. **Parity cost.** Every new screen exists twice, in both languages, with snapshots.

## 9. Decisions (settled 2026-10-03: the recommended option for all fifteen)

1. **New accounts:** (a) opt-in in Settings, (b) offered on during onboarding but skippable, (c) mandatory except demo and reviewer accounts. **Recommended: b.**
2. **Existing users:** (a) opt-in only, (b) prompted after release, (c) forced by a set date. **Recommended: b.**
3. **Turning it off again:** (a) never, (b) allowed through an unseal on the device, (c) only by deleting the data. **Recommended: b.**
4. **Unlock factors:** (a) recovery key and device only, (b) also passkey PRF and device linking, (c) also an encryption passphrase. **Recommended: b.**
5. **Recovery key format:** (a) 24 words, (b) a grouped code, (c) a downloadable file plus a code. **Recommended: c.**
6. **Helpers for encrypted accounts:** (a) keep them, sending data per request with updated switch text, (b) turn them off, (c) keep only Type it and What-if. **Recommended: a.**
7. **Weekly digest and budget-alert push:** (a) generic text, with detail in the app, (b) in-app badge only, (c) encrypted push now. **Recommended: a.**
8. **Category names and import-rule patterns:** (a) seal them, (b) keep them as metadata. **Recommended: a.**
9. **Account and goal names:** (a) seal them, (b) keep them plain. **Recommended: a.**
10. **iOS widget snapshot:** (a) accept it as plaintext under file protection, (b) show it only when unlocked, (c) no figures for encrypted accounts. **Recommended: a.**
11. **Payment details shared with groups:** (a) keep a server-encrypted copy for groups until the groups plan, (b) stop sharing them for encrypted accounts. **Recommended: a, with the UI saying so.**
12. **Web daily unlock:** (a) device key that stays unlocked, (b) unlock every session, (c) device key plus a re-unlock after 30 days. **Recommended: c.**
13. **iOS key storage:** (a) Keychain on this device only, (b) iCloud Keychain sync, (c) Keychain with an optional Face ID gate. **Recommended: c.**
14. **Groups:** (a) leave them server-encrypted indefinitely, (b) schedule the groups plan right after Phase 6. **Recommended: b.**
15. **Release gate:** (a) developer accounts only until Phase 6, (b) a public beta switch from Phase 5. **Recommended: a.**

**Settled:** 1b, 2b, 3b, 4b, 5c, 6a, 7a, 8a, 9a, 10a, 11a, 12c, 13c, 14b, 15a. Phase 0 starts after the 2026-10-09 release.
