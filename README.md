# Expense Tracker

A responsive **PWA** for personal expense tracking — log expenses and income,
set budgets, track recurring bills, and generate full financial-statement
reports (Excel + PDF). Built to grow into a friend-to-friend bill splitter.

> **Status:** v1 scaffold — the personal tracker. The friend-splitting layer
> (groups, itemized splits, balances) is designed into the schema but not yet
> built. See _Roadmap_ below.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React + Vite, Chakra UI (clean/minimal, light + dark) |
| PWA | `vite-plugin-pwa` (installable, offline app shell) |
| Backend | Supabase — Postgres + Auth + Row Level Security + Edge Functions |
| Auth | Email/password + Google (+ Apple, once a dev account is configured) |
| Reports | Supabase Edge Function → SheetJS (xlsx) + pdf-lib (pdf) |
| Offline | IndexedDB write queue, idempotent sync on reconnect |
| Hosting | Cloudflare Pages (frontend); Supabase (backend) |

## Getting started

```bash
npm install
cp .env.example .env      # fill in your Supabase URL + anon key
npm run dev
```

### Backend setup (Supabase)

1. Create a Supabase project.
2. Apply the schema: run `supabase/migrations/0001_init.sql` (via the SQL
   editor, or `supabase db push` with the CLI linked to your project).
3. In **Authentication → Providers**, enable Email and Google (add your Google
   OAuth client). Apple can be added later — it needs a paid Apple Developer
   account.
4. Deploy the report function: `supabase functions deploy generate-report`.
5. Put your project URL + anon key into `.env`.

Money is stored as **integer minor units** (cents) with the currency and the
FX rate captured at entry time, so multi-currency history never shifts when
rates change.

## Project layout

```
src/
  auth/          AuthProvider + session handling
  components/    AppShell (nav), TransactionForm
  lib/           supabase client, currency, offline queue, data hooks
  pages/         Login, Dashboard, Expenses, Budgets, Income, Reports
supabase/
  migrations/    0001_init.sql  (schema + RLS + seed)
  functions/     generate-report (xlsx + pdf edge function)
```

## Roadmap

- **v1 (this scaffold):** personal expenses, income, categories, budgets,
  recurring rules, multi-currency, dashboard, Excel/PDF reports, offline sync.
  Recurring rules are materialized daily by a `pg_cron` job (see
  `migrations/0003`) that turns due rules into transactions.
- **Receipt scanner:** photograph a receipt (native camera) → on-device OCR
  (Tesseract.js, lazy-loaded) extracts total + date → prefills the expense
  form. The image is stored in a private `receipts` Storage bucket (RLS-scoped)
  and linked to the transaction.
- **Brand/design:** "Budge" — warm coral/amber design system, Lucide icons,
  Poppins/Nunito, desktop sidebar + mobile bottom nav, light/dark.
- **v2 (schema-ready):** groups (trips/households), shared & itemized splits,
  hybrid identity (phantom contacts that upgrade to accounts), balances +
  manual settle-up. The `transactions` table already carries `group_id` /
  `is_shared` so this lands without a destructive migration.
