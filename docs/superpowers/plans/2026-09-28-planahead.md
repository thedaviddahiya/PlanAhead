# PlanAhead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Doodle-style availability poll: static GitHub Pages site + Supabase storage, with a create flow, a respond flow, and a live-updating results grid.

**Architecture:** Two static pages (`index.html` create, `poll.html` respond + results). All pure logic lives in a DOM-free ES module `js/app.js` (IDs, validation, formatting, view-model math) tested with Node's `node --test`; thin page scripts wire it to the DOM. `@supabase/supabase-js` v2 UMD from jsDelivr provides DB access and realtime.

**Tech Stack:** Plain HTML/CSS/ES-modules, `@supabase/supabase-js@2` (CDN, pinned major), Node.js built-in test runner, Playwright (via superpowers webapp-testing) for page smoke tests.

**Spec:** `docs/superpowers/specs/2026-09-28-planahead-design.md`

## Global Constraints

- No frameworks, no build step, no bundler. Plain HTML/CSS/JS ES modules only.
- Supabase client: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>` (exposes `window.supabase.createClient`). Load before module scripts on both pages.
- Only `js/config.js` is edited by a deployer: `window.PLANAHEAD_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" }`.
- Anon key only; RLS in `supabase/schema.sql`; no update/delete policies in v1.
- Poll ID: 8 chars from alphabet `23456789abcdefghjkmnpqrstuvwxyz` (no 0/o/1/i/l).
- Options payload shape (stored in `polls.options` jsonb): `{ "date": "YYYY-MM-DD", "time": "HH:MM" | null, "label": string | null }`.
- Response `selected`: array of 0-based indexes into options, min length 1.
- Grid is visible to everyone with the link; best options (max count) highlighted.
- Mobile-first responsive; system font stack; horizontal-scroll grid with sticky first column on narrow screens.

## Review Focus

- Timezone drift: a date typed as `2026-09-28` must render as "Mon 28 Sep 2026" everywhere, never shifted by local/UTC parsing. Test: `formatOption*` uses fixed-form parsing (UTC getters) — Task 1, `formatOption does not shift dates`.
- Malformed stored data: options missing fields, or `selected` indexes out of bounds / wrong types, must render defensively without throwing. Tests: `buildViewModel tolerates malformed options`, `buildViewModel ignores out-of-bounds selections` — Task 1.
- Duplicate respondent names appear as separate columns, not merged. Test: `buildViewModel keeps duplicate names separate` — Task 1.
- Empty name or zero-checked options are rejected with inline errors, form state preserved. Test: Playwright Task 3, `create/respond validation` step.
- Unknown/missing `?poll=` id shows friendly "poll not found" state, not a blank page. Test: Playwright Task 4, `not-found state` step.

---

### Task 1: Pure helpers — `js/app.js` + `test/app.test.js`

**Files:**
- Create: `js/app.js`
- Create: `test/app.test.js`

**Interfaces:**
- Consumes: nothing (DOM-free; no imports from other project files).
- Produces (named ES exports, consumed by Tasks 3–5):
  - `generatePollId(length = 8) -> string` — random chars from ID alphabet.
  - `isValidDateFormat(s) -> boolean` — true iff `YYYY-MM-DD` and a real calendar date.
  - `isValidTimeFormat(s) -> boolean` — true iff `HH:MM`, `00 <= HH <= 23`, `00 <= MM <= 59`.
  - `normalizeOptions(rawList) -> { options: [{date, time, label}], errors: string[] }` — trims, validates each entry via the two format checks, drops empties/dupes into `errors`.
  - `findDuplicateKeys(options) -> string[]` — returns duplicated `date|time` keys (empty list = no dupes).
  - `validatePollInput({ title, description, options }) -> string[]` — error strings: `"Please enter a title."`, `"Add at least one option."`, plus duplicate-option message `"Remove duplicate options."` when `findDuplicateKeys` returns any. Title must be ≤ 200 chars, description ≤ 2000.
  - `validateResponseInput(name, selectedCount) -> string[]` — `"Please enter your name."` (empty/whitespace or > 80 chars), `"Select at least one option."` (count 0).
  - `formatOption(option) -> string` — e.g. `"Mon, 28 Sep 2026 · 18:00"`; omit date part for null/invalid date; time `null` → `"Mon, 28 Sep 2026"`; both broken → `"Option"`.
  - `buildViewModel(options, responses) -> { rows, names, maxCount }` where `rows = [{ option, index, count, voters: [names in response order] }]` in poll order, `voters` skipping out-of-bounds or non-number selections; `names` = respondent names in insertion order by `created_at`; duplicate names kept separate; `maxCount` = highest row count (0 if none). Malformed options render as label fallback `"Option"` without throwing.
  - `buildShareLink(pollId) -> string` — `location.origin + location.pathname + "?poll=" + pollId`.
  - `getClient() -> SupabaseClient | null` — reads `window.PLANAHEAD_CONFIG`, returns `null` when URL or key is missing/placeholder (`"<URL>"`/`"<KEY>"`), else memoized `supabase.createClient(url, key)`.

- [ ] **Step 1: Write the failing tests** in `test/app.test.js` (ES module, `import { ... } from '../js/app.js'`), asserting:
  - `generatePollId` returns 8 chars only from the alphabet; two calls usually differ.
  - `isValidDateFormat("2026-09-28")` true; `"2026-13-01"`, `"09/28/2026"`, `"2026-2-8"` false.
  - `isValidTimeFormat("18:00")` true; `"24:00"`, `"6:00"`, `"18:60"` false.
  - `normalizeOptions` sorts nothing but returns cleaned entries; drops blank/invalid entries with errors.
  - `findDuplicateKeys(["date:time dupes"])` — two identical `{date:"2026-09-29", time:"18:00"}` yield one dup key; a third `{date:"2026-09-29", time:null}` distinct.
  - `validatePollInput`: empty title → title error; zero options → option error; dupe → dupe error; all valid → `[]`.
  - `validateResponseInput`: `""`/`"  "` → name error; 0 selected → selection error; valid → `[]`.
  - `formatOption({date:"2026-09-28", time:"18:00"})` → `"Mon, 28 Sep 2026 · 18:00"`; `time:null` → `"Mon, 28 Sep 2026"`; malformed → `"Option"` ("formatOption does not shift dates").
  - `buildViewModel`: 2 options × 3 responses with one out-of-bounds selection → counts `[2,1]`, out-of-bounds ignored, voters correct ("buildViewModel ignores out-of-bounds selections"); two responses with the same name → two columns ("keeps duplicate names separate"); options containing `null`/junk entries → no throw, label fallback; `maxCount = 2`.
  - `buildShareLink` with `window.history.replaceState`-stubbed location not needed — implement by reading `location` global; in Node shim `globalThis.location = { origin:"https://x.github.io", pathname:"/availability-poll/" }` before import.
  - `getClient`: no config → null; placeholder strings → null; valid strings → object with `.from` function (fake param via injecting test double through `window.supabase = { createClient: (u,k)=>({from:(t)=>({table:t})}) }` and `window.PLANAHEAD_CONFIG`).
- [ ] **Step 2: Run `node --test test/`** — expect FAIL (module not found / missing exports).
- [ ] **Step 3: Implement `js/app.js`** exporting exactly the functions above. `formatOption` must parse `YYYY-MM-DD` by splitting the string and using `new Date(Date.UTC(y, m-1, d))` then `getUTC*` accessors + hardcoded weekday/month name arrays — never `new Date("YYYY-MM-DD")` local parsing. `clientId` memoization via module-level `let client`.
- [ ] **Step 4: Run `node --test test/`** — expect all PASS.
- [ ] **Step 5: Commit** `git add js/app.js test/app.test.js && git commit -m "feat: pure helpers with unit tests"`

### Task 2: Supabase schema — `supabase/schema.sql`

**Files:**
- Create: `supabase/schema.sql`

**Interfaces:**
- Consumes: option-payload shape from Global Constraints.
- Produces: tables+policies later tasks assume: `polls(id text pk, title, description, options jsonb, created_at)`, `responses(id uuid pk default gen_random_uuid(), poll_id text fk→polls on delete cascade, name, selected int[], created_at)`; realtime publication includes `responses`.

- [ ] **Step 1: Write `supabase/schema.sql`** containing, in order: `create extension if not exists pgcrypto;`; `polls` table (`title text not null check (char_length(title) between 1 and 200)`, `description text check (description is null or char_length(description) <= 2000)`, `options jsonb not null default '[]' check (jsonb_typeof(options) = 'array')`); `responses` table (`name text not null check (char_length(name) between 1 and 80)`, `selected int[] not null default '{}' check (array_length(selected, 1) >= 1)`, index `responses_poll_id_idx on responses(poll_id)`); `alter table ... enable row level security;` on both; four policies `for select to anon using (true)` / `for insert to anon with check (...)` (responses insert checks referenced poll exists via `exists (select 1 from public.polls p where p.id = poll_id)`); and `alter publication supabase_realtime add table public.responses;`.
  Header comment: paste into Supabase → SQL Editor → New query.
- [ ] **Step 2: Verify by review** — read the file top-to-bottom against the Interfaces block above: table/column/check names match verbatim; both tables have RLS enabled with distinct names shared with Task 3/4 queries (`from('polls')`, `from('responses')`).
- [ ] **Step 3: Commit** `git add supabase/schema.sql && git commit -m "feat: supabase schema with RLS"`

### Task 3: Create flow — `index.html` + `js/create.js`

**Files:**
- Create: `index.html`
- Create: `js/create.js`
- Create: `js/config.js` — `window.PLANAHEAD_CONFIG = { supabaseUrl: "<URL>", supabaseAnonKey: "<KEY>" };` with a comment pointing at `README.md#setup`
- Create minimal `style.css` (page shell + form styles; Task 5 completes it)

**Interfaces:**
- Consumes: `generatePollId`, `normalizeOptions`, `validatePollInput`, `buildShareLink`, `getClient` from `js/app.js`; `window.supabase.createClient` CDN script.
- Produces: DOM contract for Task 5 styling and final smoke: elements `#title`, `#description`, `#date-input`, `#time-input`, `#add-option`, `#options-list`, `#create-form`, `#create-error`, `#result-panel` (share state), `#share-link`, `#copy-link`, `#open-poll`, `#setup-notice`. Pending options array lives in a closure and renders one `<li class="option-chip">` per entry with a remove button.

- [ ] **Step 1: Write `index.html`** — `<meta name="viewport" ...>`, `<link rel="stylesheet" href="style.css">`, supabase-js CDN script, then `<script type="module" src="js/config.js">` and `<script type="module" src="js/create.js">`. Visible heading "PlanAhead". Form section per DOM contract above: title input, description textarea, date + time inputs, "Add option" button, options list, "Create poll" submit — plus a setup notice div (hidden unless keys missing) linking to `README.md#setup`.
- [ ] **Step 2: Write `js/create.js`** wiring:
  - On load: if `getClient()` returns null → show `#setup-notice`, disable submit.
  - "Add option" click: validate `#date-input`/`#time-input` via `normalizeOptions` on a one-entry list; invalid → put message in `#create-error`; valid → push `{date, time: value||null, label: null}` to pending list, re-render chips, clear inputs (keep date for fast date+multiple-times entry).
  - Chip remove buttons splice pending list.
  - Submit handler: `e.preventDefault()`; `validatePollInput(...)`; errors → `#create-error` joined with line breaks, keep state; success → keep trying up to 5 attempts: `generatePollId()`, `await client.from('polls').insert({ id, title: title.trim(), description: description.trim() || null, options })`; on unique-violation (error code `23505`) retry; other errors → `#create-error` shows the message; success → hide form, show `#result-panel` with `#share-link` (`buildShareLink(id)`, `textContent` = link), `#copy-link` (uses `navigator.clipboard.writeText`, falls back to `document.execCommand('copy')`), `#open-poll` (`href` = link).
- [ ] **Step 3: Syntax + unit check** — `node --check js/create.js`; `node --test test/` (unchanged, must pass).
- [ ] **Step 4: Playwright smoke** (local server `python3 -m http.server 8090`, via webapp-testing):
  - Page renders form; entering a blank "Add option" shows an error in `#create-error`;
  - adding valid date+time appends a chip; empty title submit shows title error (no network called since `#setup-notice` visible in unconfigured state — this pins the validation path "create/respond validation" from Review Focus);
  - zero chips submit shows option error.
- [ ] **Step 5: Fix anything the smoke found; re-run until green.**
- [ ] **Step 6: Commit** `git add index.html js/create.js js/config.js style.css && git commit -m "feat: create poll flow"`

### Task 4: Respond + results — `poll.html` + `js/poll.js`

**Files:**
- Create: `poll.html`
- Create: `js/poll.js`

**Interfaces:**
- Consumes: `formatOption`, `buildViewModel`, `validateResponseInput`, `getClient` from `js/app.js`; tables from Task 2 (`polls`, `responses`); realtime channel naming `planahead-<pollId>` subscribed to `postgres_changes` INSERT on `public.responses` filtered `poll_id=eq.<id>`.
- Produces: DOM contract for Task 5 + smoke: `#poll-title`, `#poll-description`, `#respond-panel`, `#name-input`, `#options-list` (checkbox group; `input[value="<index>"]`), `#submit-response`, `#respond-error`, `#thankyou-panel`, `#results-panel`, `#results-grid`, `#refresh-results`, `#notfound-panel`, `#setup-notice`.

- [ ] **Step 1: Write `poll.html`** — same shell as Task 3 (viewport, style.css, CDN script, `js/poll.js` module). Static skeleton: `#poll-title` (`h1`), `#poll-description`, `#notfound-panel`, `#setup-notice`, `#respond-panel` (name input, options group, submit, error div), `#thankyou-panel`, `#results-panel` with `#refresh-results` button and `#results-grid` container.
- [ ] **Step 2: Write `js/poll.js`**:
  - `const pollId = new URLSearchParams(location.search).get('poll')`; sane check `/^[23456789a-hjkmnp-z]{8}$/` — invalid or `getClient()` null → show matching panel (`#notfound-panel` / `#setup-notice`) and stop.
  - Load poll: `client.from('polls').select('*').eq('id', pollId).maybeSingle()`; error → `#notfound-panel` text becomes "Could not reach the database." + retry button; data null → "poll not found" variant; else render title/description and checkbox list from `poll.options` (one label per option via `formatOption`, checkboxes in poll order, value = index), then load results: `client.from('responses').select('name, selected, created_at').eq('poll_id', pollId).order('created_at')` → `buildViewModel(poll.options, data)` → render grid into `#results-grid`: table, header `[Option, ...names, Count]` (Count leading column per spec), rows in poll order, ✓ in cells for selected, count cell bold + row tinted when `count === maxCount && maxCount > 0`. Mobile: CSS `.results-scroll` wrapper with sticky first column.
  - Realtime: `client.channel('planahead-' + pollId).on('postgres_changes', {event:'INSERT', schema:'public', table:'responses', filter:'poll_id=eq.'+pollId}, () => loadResults()).subscribe()`; refetch handler also bound to `window` `focus`/`visibilitychange` and `#refresh-results`.
  - Submit: `validateResponseInput(name, checkedCount)`; errors → `#respond-error` (preserve state); success → insert `{poll_id: pollId, name: name.trim(), selected: checkedIndexes.sort((a,b)=>a-b)}`; insert error → inline message; success → hide `#respond-panel`, show `#thankyou-panel`, results refresh via realtime/refetch.
- [ ] **Step 3: Syntax + unit check** — `node --check js/poll.js`; `node --test test/` must pass.
- [ ] **Step 4: Playwright smoke**:
  - `/poll.html` without params → `#notfound-panel` visible;
  - `/poll.html?poll=ab12cd34` with no Supabase keys → `#setup-notice` visible, no JS crash in console (pins "poll not found" + "unconfigured" Review Focus inputs);
  - with valid keys configured (Task optional-final): create a real poll, open link, submit availability, see grid update on a second page-load (this E2E step runs only when real keys exist; otherwise recorded as owner-manual step in README).
- [ ] **Step 5: Fix findings; re-run until green.**
- [ ] **Step 6: Commit** `git add poll.html js/poll.js && git commit -m "feat: respond flow with live results"`

### Task 5: Full styling + README — `style.css`, `README.md`

**Files:**
- Modify: `style.css` (complete design system)
- Create: `README.md`

**Interfaces:**
- Consumes: DOM contracts from Tasks 3–4.
- Produces: final visual system; README `#setup` section (anchor used by `#setup-notice` links in both pages).

- [ ] **Step 1: Complete `style.css`** — mobile-first: card layout on system font stack; inputs/buttons/toggles consistent; `.option-chip` pills with remove buttons; results table styling (sticky first column, zebra rows, highlight class for best rows, count badge); `@media (min-width: 720px)` two-column poll layout (respond left, results right); focus-visible outlines; no CSS framework, single file.
- [ ] **Step 2: Write `README.md`** with `## Setup` (`#setup` anchor) covering: 1) create Supabase project; 2) run `supabase/schema.sql` in SQL editor; 3) enable realtime (schema does it; verify in dashboard under Database → Realtime that `responses` is on); 4) put URL + anon key into `js/config.js`; 5) push to GitHub, enable Pages (branch `main`, root); 6) add your `repo` name to share-link expectations. Plus "Replace this file" note in `js/config.js` and a "Local testing" snippet (`python3 -m http.server`).
- [ ] **Step 3: Visual check** — load both pages in browser at 375px and 1280px widths; confirm no overflow, tap targets ≥ 40px, sticky first column works in a poll with 6+ names (synthetic DOM injection via Playwright `page.evaluate` suffices — no real data needed).
- [ ] **Step 4: Commit** `git add style.css README.md && git commit -m "feat: complete styling and setup docs"`

### Task 6: Final verification

**Files:** none created (verification only; fixes may touch any file).

- [ ] **Step 1: `node --test test/`** — all pass.
- [ ] **Step 2: `node --check` every JS file** (`js/app.js js/create.js js/poll.js js/config.js`).
- [ ] **Step 3: Playwright end-to-end** — with real Supabase keys if the owner has supplied them: full create → share → respond ×2 → live grid path; otherwise confirm unconfigured-state UX on both pages and list E2E as owner-manual in README (already done in Task 5).
- [ ] **Step 4: Review focus sweep** — re-check each Review Focus line has a passing test or verified behavior.
- [ ] **Step 5: Commit any fixes** `git commit -m "fix: end-to-end findings"`.
