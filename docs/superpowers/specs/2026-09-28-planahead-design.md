# PlanAhead — Availability Poll Design

Date: 2026-09-28
Status: Approved design, ready for implementation planning

## Purpose

PlanAhead is a lightweight, Doodle-style availability poll. One person proposes
a set of date/time options and shares a link; everyone else ticks the options
that work for them. Everyone with the link can see the live results grid.

Out of scope (deliberately, for v1): accounts, OAuth, email, calendar
integrations, frameworks, payments, admin dashboards.

## Constraints

- **Hosting:** Static site on GitHub Pages. Deploy = push to `main`.
- **Backend:** Supabase only (database + realtime). Anon/public key in the
  client, Row Level Security enforced server-side.
- **Code:** Plain HTML, CSS, JavaScript (ES modules). Zero build steps.
- **Responsiveness:** Clean, fast, usable on desktop and mobile.
- **Privacy stance:** anyone with the poll link can respond and view results.

## Architecture

Static files served by GitHub Pages:

- `index.html` — poll creation page (also serves as the landing page).
- `poll.html` — respond + view-results page for a poll (`?poll=<id>`).
- `js/config.js` — the only file a deployer edits: Supabase URL and anon key.
- `js/app.js` — shared module: Supabase client init, ID generation, option
  helpers, share-link building, small DOM/format utilities.
- `js/create.js` — create-page logic.
- `js/poll.js` — poll-page logic (respond form + results grid + realtime).
- `style.css` — single stylesheet, mobile-first, system font stack.
- `supabase/schema.sql` — copy-paste setup for the Supabase SQL editor.
- `README.md` — setup instructions (Supabase project, RLS, config, Pages).

`@supabase/supabase-js` is loaded from a pinned version on jsDelivr as a
classically-scripted global (` supabase-js` UMD build) so no bundler is
needed. Application code stays in plain ES modules.

### Data model

Table **`polls`**:
- `id text primary key` — short public ID (8 chars, generated client-side
  from a no-lookalike alphabet, retried server-unique at insert).
- `title text not null` (1–200 chars)
- `description text null` (≤ 2000 chars)
- `options jsonb not null` — array of `{ "date": "YYYY-MM-DD", "time": "HH:MM" | null, "label": string | null }`.
  At least one option required. A missing `time` means an all-day date option.
- `created_at timestamptz default now()`

Table **`responses`**:
- `id uuid primary key default gen_random_uuid()`
- `poll_id text not null references polls(id) on delete cascade`
- `name text not null` (1–80 chars)
- `selected int[] not null` — indexes into the poll's options array. At least
  one index, each within bounds (validated client-side; DB check enforces
  non-empty only — bounds re-checked at render time defensively).
- `created_at timestamptz default now()`

### Row Level Security

Both tables have RLS enabled. Policies use role `anon` (and `authenticated`
for completeness):

- `polls`: select for all; insert for all (creating a poll is public).
- `responses`: select for all; insert for all with check that the
  referenced poll exists (enforced too by the FK).
- No update/delete policies — responses are immutable; polls are never
  edited in v1. (Deleting a stray poll is done manually in the dashboard.)

### Realtime

Realtime is enabled for `responses`. On the poll page, a subscription to
inserts on the poll's responses re-renders the grid live. Fallback: the grid
refetches on window focus and on visibilitychange, and there is a "Refresh"
button.

## Create flow (`index.html`)

1. Title required; description optional; both editable text inputs.
2. Option builder: add a date via date input; optional time(s). "Add time"
   chips let a date carry multiple times (e.g. Mon 18:00 and Mon 19:00 are
   two options). Also supports date-only options (no times added).
3. Options are listed as removable chips/rows before submission.
4. Submit:
   - Client validates: title non-empty, ≥ 1 option, no duplicates.
   - Generate 8-char ID; insert row; on unique-violation retry with new ID
     (up to 5 attempts).
   - Success view shows the share link
     `https://<user>.github.io/<repo>/?poll=<id>` (built from
     `location.origin + location.pathname`), a copy button, and a
     "Open poll" link.
5. Duplicate option (same date+time) → inline error at submit.

## Respond flow (`poll.html?poll=<id>`)

1. Page reads `poll` query param. Missing/malformed → "Poll not found"
   empty state with link home.
2. Fetch poll row by ID. Not found → same empty state.
3. Render: title, description, grouped option checkboxes (grouped by date,
   in poll order), name input, submit button ("Submit availability").
4. Validate client-side: name non-empty, ≥ 1 selected. Inline errors.
5. Submit inserts response; then the form is replaced by a thank-you state
   and the grid below updates automatically (realtime or refetch).
6. Duplicate names are allowed (Doodle-style); no email, no auth.

## Results grid

- Always visible on the poll page below the respond form.
- Rows = options ("Mon 28 Sep · 18:00"), columns = respondent names, and a
  leading count column. ✓ marks availability. On mobile the grid scrolls
  horizontally with a sticky first column.
- Options are listed in poll order; the best option(s) — highest count —
  are highlighted (bold header/count + subtle row tint).
- Live updates: realtime insert subscription + focus refetch fallback.
- Updates require no manual refresh of the page.

## Error handling

- Unconfigured Supabase keys (default placeholder in `config.js`) → every
  page shows a setup-needed notice linking to README section.
- Failed insert → inline error, response form preserved (user's input kept).
- Failed poll fetch → "could not reach the database" state with retry.
- Legacy/invalid date strings from stored data → rendered as-is, no crash.

## Testing and verification

- Static checks: `node --check` on all JS; HTML/CSS sanity by inspection.
- Playwright smoke test (webapp-testing skill) against a local static server:
  create flow renders, validation fires, poll-not-found state works. Real
  Supabase end-to-end (create → respond → live grid) runs once real keys are
  configured; that step is documented in README for the owner.
- Manual checklist in README covers Supabase setup verification.

## Future room (not implemented)

Private participant links, poll closing, poll editing/deleting from UI,
notifications/export. Data model and page structure keep these easy to add
(no owner secrets, no assumptions that block a later `closed_at` column).
