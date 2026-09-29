# PlanAhead Phase 2 — Creation Password, Respond Calendar, Day-Only Options

Date: 2026-09-29
Status: Approved (design dialogue complete)
Prior spec: `docs/superpowers/specs/2026-09-28-planahead-design.md` (still authoritative for v1 foundations)

## What this phase adds

Four approved changes on top of the current amber calendar+heatmap build:

1. **Creation password, enforced by the server.** Only someone who knows the poll
   password may create a poll. Participants never see a password prompt.
2. **Respond flow uses the same wall calendar.** Respondents pick times on the same
   full-month calendar the creator uses; the calendar doubles as the results view,
   showing who is free via colored tiles.
3. **Day-only options.** A day clicked but left without chosen times means
   "available 9:00–17:00" — not "no availability".
4. **Typography and header alignment.** Montserrat becomes the body font; Fraunces
   stays for display headings; page titles left-align over the content column.

## 1. Creation password (server-enforced)

### Storage

New table `app_config` (one row per setting):

- `key text primary key`
- `value text not null`

The creation password is stored as `key = 'creation_password_hash'`,
`value = crypt('<password>', gen_salt('bf', 10))` — bcrypt via pgcrypto.

### Server-side check

A `security definer` SQL function `creation_password_matches(candidate text)`
returns whether the candidate password matches the stored hash. It is stable and
executable by `anon`.

The anon INSERT policy on `polls` changes from "always allow" to:

```sql
create policy "password holders can create polls"
  on public.polls for insert to anon
  with check (creation_password_matches(current_setting('request.headers', true)::json->>'x-planahead-password'));
```

The password travels in the `x-planahead-password` request header, set per-insert
via supabase-js `headers` option on the insert call — never persisted anywhere
server-side and never part of the stored row.

### Client behavior (create page)

- New required password field on the create form.
- After the first successful creation, the password is remembered in
  `localStorage` (`planahead-creation-password`) and pre-filled on later visits.
- Wrong password → Supabase returns an RLS violation; the form shows
  "That password was not accepted." inline and re-enables submission.
- Participants never see a password prompt; the respond page is unchanged.

### Setup / password change

README gains one SQL line the owner runs to set or change the password:

```sql
update app_config set value = crypt('NEW-PASSWORD', gen_salt('bf', 10)) where key = 'creation_password_hash';
```

An equivalent insert exists for first-time setup.

## 2. Respond flow = same wall calendar + colored tiles

### Shared calendar module

The wall calendar (month grid, prev/next nav, Mo–Su header, dim leading/trailing
days, day-click popover with fixed chips / exact time / range expansion / chosen
chips / clear / done) is extracted from `js/create.js` into a shared module
`js/calendar.js` used by both create and respond pages. No behavior change on the
create page.

### Respond page changes

- The checkbox list is replaced by the same calendar.
- Before submitting, the respondent's own chosen slots render as the creator's do
  (amber chips/dots via the same popover).
- **After responses exist** (including the respondent's own once submitted),
  each day cell shows one small colored tile per person who is free *at any time
  that day*, plus ★ on days where the maximum number of people overlaps.
  Tile colors are assigned per unique respondent name (stable order; amber
  `#96700f` first, then a fixed palette cycle: `#3a6b35`, `#5a4a8a`, `#8a3038`,
  then further hues). A legend under the calendar maps colors to names.
- Tapping a day opens the same picker popup plus a **per-time readout**: for each
  offered slot that day, who is free (names listed per slot). If the day is a
  9–17 day-only day, the readout says "Available 09:00–17:00".
- Name field and "Submit availability" button stay as-is. Results remain live
  (realtime + refresh fallbacks unchanged).

### Results view unchanged

The results heatmap below (dates = columns, times = rows) stays. The calendar
tiles are an availability *overview*; the heatmap remains the per-slot detail.

## 3. Day-only options (time: null means 9–17)

- In the day popover, "Done" with **zero chosen slots** now stores the day as a
  day-only option: `{ date, time: null, label: null }` (existing schema already
  allows `time: null`).
- Semantics everywhere: a `time: null` option means **available 09:00–17:00**.
- Respond page: a day-only day is pre-selected-available for the whole 9–17
  window; tapping it shows the 9–17 readout. The heatmap renders `time: null`
  rows labeled "09:00–17:00".
- Pure helpers (`normalizeOptions`, `buildViewModel`, `buildHeatmap`) already
  tolerate `time: null`; the only new logic is the popover's "day saved as
  9–17" state and readout labeling. Covered by tests.
- Backward compatible: previously created polls that used `time: null` as a
  generic all-day marker now render as 9–17, which matches the approved intent.

## 4. Typography and header alignment

- Body font: **Montserrat** (Google Fonts, weights 400/500/600/700), loaded via
  existing `<link>` pattern with preconnect.
- Display font: **Fraunces stays** for `h1`, `h2`, popover title, month label,
  heat day numbers.
- Page titles (`h1`) left-align over the content column (they already sit in the
  content column; confirm no centering and consistent left edge with cards).
- CSS custom properties updated; no selector contracts change.

## Compatibility and risks

- `responses` table untouched; existing polls keep working (options with
  `time: null` gain the 9–17 meaning).
- The polls INSERT policy change requires the `app_config` table + function to
  exist BEFORE the policy update, or poll creation breaks. The schema migration
  file must order statements accordingly and be idempotent.
- If the owner has not set a password, creation fails for everyone (intentional:
  the gate is the point). README calls this out as step one.
- `x-planahead-password` header must be allowed by Supabase (custom request
  headers are supported via `db.headers` / supabase-js global headers).
- TDD: new pure helpers (password prefill/gate logic, day-only handling, tile
  color assignment) get failing tests first; existing 16 tests must stay green.

## Out of scope (unchanged)

Settings panel (dropped), private participant links, poll closing/editing,
notifications, auth for participants.
