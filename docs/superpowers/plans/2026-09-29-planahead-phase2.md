# PlanAhead Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server-enforced creation password, respond flow on the same wall calendar with per-person colored tiles, day-only 9–17 options, and Montserrat body typography.

**Architecture:** Extend the Postgres RLS model with an `app_config` table and a security-definer password check consulted by the polls INSERT policy. Extract the wall calendar from `js/create.js` into a shared `js/calendar.js` consumed by both create and respond pages; the respond page renders per-person tiles from response data. All new branching logic lives in tested pure helpers in `js/app.js`.

**Tech Stack:** Vanilla ES modules, supabase-js v2 UMD CDN, PostgreSQL RLS + pgcrypto bcrypt, node:test.

**Spec:** `docs/superpowers/specs/2026-09-29-planahead-phase2-design.md`

## Global Constraints

- Poll ID alphabet `23456789abcdefghjkmnpqrstuvwxyz`, 8 characters (unchanged).
- Option payload stays `{ date: YYYY-MM-DD, time: HH:MM|null, label: null }`; `time: null` now means "available 09:00–17:00".
- Password travels ONLY in the `x-planahead-password` request header, set per-insert via supabase-js `headers` option; never stored in the row, never persisted server-side.
- localStorage key for the remembered creation password: `planahead-creation-password`.
- Tile palette order: `#96700f`, `#3a6b35`, `#5a4a8a`, `#8a3038`, then further hues.
- Schema migration must create `app_config` + `creation_password_matches()` BEFORE altering the polls INSERT policy, and must be idempotent.
- Body font Montserrat weights 400/500/600/700 via Google Fonts `<link>` with preconnect; Fraunces stays for h1, h2, popover title, month label, heat day numbers.
- No selector contracts break: all existing element IDs and JS selector hooks stay.
- Tests: `node --test` from repo root (bare, no path argument). Existing 16 tests must stay green after every task.

## Review Focus

- Empty `app_config` (no password row): every creation attempt fails closed — creation must show the RLS error inline, not a generic message. Test: wrong-password error path in create.js treats missing row the same as mismatch (pinned by error-mapping unit test).
- Password header typo or stripped header: policy must reject, not silently accept. Test: `creation_password_matches` SQL reviewed for null/header-missing → false (manual SQL review step, no psql available).
- Respond calendar on a poll whose options span two months: tiles must aggregate across month views without duplicating people. Test: tile-mapping helper groups by date regardless of month (unit test).
- Day-only day in respond popup before own submission: picker must not pre-check slots, only show the 09:00–17:00 readout. Test: day-only handling helper returns readout, no slots (unit test).
- Duplicate respondent names across responses: tile assignment must key on unique name, not response row. Test: two responses with the same name yield ONE tile (unit test).

---

### Task 1: Pure helpers — tile palette, day-only readout, response availability map

**Files:**
- Modify: `js/app.js`
- Test: `test/app.test.js`

**Interfaces:**
- Consumes: existing `buildViewModel(options, responses)` (rows carry `raw`, `count`, `voters`).
- Produces (exact signatures later tasks import):
  - `PERSON_COLORS` — exported array, first four entries exactly `#96700f`, `#3a6b35`, `#5a4a8a`, `#8a3038`.
  - `assignTileColors(names: string[]) -> Map<string, string>` — unique names in first-seen order mapped to palette entries, cycling beyond the palette.
  - `dayAvailabilityLabel(time: string|null) -> string` — `"09:00–17:00"` for `null`/absent/invalid, else the time string.
  - `buildAvailabilityByDay(rows: viewModel rows) -> Map<string, {names: string[]}>` — date → every voter free at any option on that date (deduped, first-seen order; invalid selected indexes ignored).

- [ ] **Step 1: Write the failing tests**

Add to `test/app.test.js` (import the three new exports plus `PERSON_COLORS`):

```js
test('PERSON_COLORS leads with the approved palette order', () => {
  assert.deepEqual(PERSON_COLORS.slice(0, 4),
    ['#96700f', '#3a6b35', '#5a4a8a', '#8a3038']);
});

test('assignTileColors maps unique names in first-seen order and cycles the palette', () => {
  const colors = assignTileColors(['Ana', 'Ben', 'Ana', 'Chloe', 'Dan', 'Eve']);
  assert.equal(colors.get('Ana'), '#96700f');
  assert.equal(colors.get('Ben'), '#3a6b35');
  assert.equal(colors.get('Chloe'), '#5a4a8a');
  assert.equal(colors.get('Dan'), '#8a3038');
  assert.equal(colors.get('Eve'), '#96700f');
  assert.equal(colors.size, 5);
});

test('dayAvailabilityLabel renders the 9-17 window for day-only options', () => {
  assert.equal(dayAvailabilityLabel(null), '09:00–17:00');
  assert.equal(dayAvailabilityLabel(undefined), '09:00–17:00');
  assert.equal(dayAvailabilityLabel('junk'), '09:00–17:00');
  assert.equal(dayAvailabilityLabel('18:00'), '18:00');
});

test('buildAvailabilityByDay collects deduped per-day voters', () => {
  const options = [
    { date: '2026-09-28', time: '18:00', label: null },
    { date: '2026-09-28', time: '19:00', label: null },
    { date: '2026-09-29', time: null, label: null },
  ];
  const responses = [
    { name: 'Ana', selected: [0, 2], created_at: '2026-01-01' },
    { name: 'Ben', selected: [0, 1], created_at: '2026-01-02' },
  ];
  const byDay = buildAvailabilityByDay(buildViewModel(options, responses).rows);
  assert.deepEqual([...byDay.get('2026-09-28').names], ['Ana', 'Ben']);
  assert.deepEqual([...byDay.get('2026-09-29').names], ['Ana']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `does not provide an export named 'PERSON_COLORS'`

- [ ] **Step 3: Implement the four exports in `js/app.js`**

Place them after `buildHeatmap`. `buildAvailabilityByDay` consumes rows whose `raw` and `voters` fields already exist (from the v1 redesign); a voter counts for a day if they appear in ANY option's voters for that date.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — 20/20.

- [ ] **Step 5: Commit**

```bash
git add js/app.js test/app.test.js
git commit -m "feat: tile palette, day-only label, availability map helpers"
```

---

### Task 2: Schema migration — app_config table, password function, policy update

**Files:**
- Create: `supabase/migration-creation-password.sql`
- Modify: `supabase/schema.sql`, `README.md`

**Interfaces:**
- Consumes: existing `supabase/schema.sql` policy names and structure.
- Produces: server contract every later task relies on —
  - Table `public.app_config (key text primary key, value text not null)` with RLS enabled and a select-to-anon policy on the table (SELECT is safe: it holds only the bcrypt hash).
  - `creation_password_matches(candidate text)` — `stable`, `security definer`, `set search_path = public`, executable by `anon`; returns false when `app_config` has no `creation_password_hash` row, when the header is missing/empty, or when `crypt(candidate, stored) <> stored`.
  - The polls anon INSERT policy named `password holders can create polls` with `with check (creation_password_matches(current_setting('request.headers', true)::json->>'x-planahead-password'))`.
  - README gains: the one-line password set/change SQL (`update app_config set value = crypt('NEW-PASSWORD', gen_salt('bf', 10)) where key = 'creation_password_hash';` plus the first-time insert), and the note that creation fails for everyone until a password is set.

- [ ] **Step 1: Write `supabase/migration-creation-password.sql`**

Idempotent statements in this order: create `app_config` (+ RLS + select policy); create-or-replace `creation_password_matches`; drop the old polls INSERT policy by name then create `password holders can create polls` with the `with check` above. Order matters: table and function BEFORE the policy.

- [ ] **Step 2: Apply the same end-state to `supabase/schema.sql`**

Fresh installs must produce the same result: `app_config` table, function, and the new policy replace the old all-allow INSERT policy. No psql is available — correctness is by careful SQL review (statement order, idempotency, `crypt`/`gen_salt` from pgcrypto, which `schema.sql` already ensures via `create extension if not exists pgcrypto`).

- [ ] **Step 3: Update `README.md` setup section**

Add the password step (first-time insert + change SQL line verbatim from the spec) and the fails-closed warning.

- [ ] **Step 4: Verify non-SQL invariants and commit**

Run: `node --test` (16/16 unaffected) and confirm migration ordering by reading the file top to bottom.
Commit message: `feat: server-enforced creation password schema`

---

### Task 3: Create page password gate

**Files:**
- Modify: `index.html`, `js/create.js`, `style.css`
- Test: `test/app.test.js` (error-mapping helper only)

**Interfaces:**
- Consumes: `getClient()`; server contract from Task 2.
- Produces: `mapCreationError(codeOrMessage) -> string` exported from `js/app.js` — returns `"That password was not accepted."` when the RLS violation (code `42501`) or its Supabase message pattern is detected, else `null`. create.js uses it to translate insert failures.

- [ ] **Step 1: Write the failing test**

```js
test('mapCreationError flags the RLS password rejection', () => {
  assert.equal(mapCreationError('42501'), 'That password was not accepted.');
  assert.equal(
    mapCreationError('new row violates row-level security policy for table "polls"'),
    'That password was not accepted.');
  assert.equal(mapCreationError('23505'), null);
  assert.equal(mapCreationError('Could not reach the database.'), null);
});
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `node --test`
Expected: FAIL — no export named `mapCreationError`.

- [ ] **Step 3: Implement `mapCreationError` in `js/app.js`, wire the form in `create.js`/`index.html`**

- `index.html`: required password input (`id="create-password"`, `autocomplete="off"`, label "Creation password") between description and the calendar fieldset.
- `create.js`: on submit, read the password; empty → inline error, no request. Pass it per-insert via `{ headers: { 'x-planahead-password': password } }` as the third argument of `.insert()`. On failure, check `mapCreationError(error.code ?? error.message)` first, then existing `23505` retry logic unchanged. After a successful insert, `localStorage.setItem('planahead-creation-password', password)`; on load, prefill from that key.
- `style.css`: no new contract; reuse existing input styles.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — 21/21.

- [ ] **Step 5: Commit**

```bash
git add index.html js/create.js js/app.js test/app.test.js style.css
git commit -m "feat: creation password gate on create form"
```

---

### Task 4: Shared calendar module extraction

**Files:**
- Create: `js/calendar.js`
- Modify: `js/create.js`
- Test: none new (behavior-preserving refactor; suite must stay green)

**Interfaces:**
- Consumes: current `js/create.js` calendar/popover code verbatim (month state, `renderCalendar`, `openPopover`, `closePopover`, `positionPopover`, popover render + handlers, `daySlots` Map semantics: date → sorted time strings).
- Produces: `js/calendar.js` exporting one factory:
  - `createCalendar({ gridEl, monthEl, prevEl, nextEl, popoverEl, backdropEl, popoverTitleEl, slotChipsEl, exactInputEl, addExactEl, rangeStartEl, rangeEndEl, addRangeEl, popoverErrorEl, chosenListEl, clearEl, doneEl })` — returns `{ daySlots, renderCalendar, openPopover, closePopover, setError, onChange }` where `daySlots` is the Map, `setError(message)` renders into `popoverErrorEl`, and `onChange(cb)` registers a callback invoked after every mutation (chip toggle, add, remove, clear) so hosts can re-render summaries. The factory owns DOM event wiring exactly as create.js does today. Escape/outside-click/backdrop close, focus return, capture-phase outside-click closer, and mobile bottom-sheet positioning all move into the module unchanged.

- [ ] **Step 1: Move the calendar + popover code from `js/create.js` into `js/calendar.js` as the factory**

Same logic, parameterized by the element map above. create.js keeps: `incomingPollId` redirect, title/description/error/summary/submit/clipboard logic, and renders its summary chips from `calendar.daySlots` via the `onChange` callback.

- [ ] **Step 2: Rewrite `js/create.js` to consume the factory**

The calendar fieldset markup in `index.html` is unchanged (IDs already match the factory contract).

- [ ] **Step 3: Verify behavior preservation and commit**

Run: `node --check js/calendar.js && node --check js/create.js && node --test`
Expected: PASS — 21/21.
Commit message: `refactor: extract shared wall-calendar module`

---

### Task 5: Respond page calendar + tiles + day-only readout

**Files:**
- Modify: `poll.html`, `js/poll.js`, `style.css`
- Test: `test/app.test.js` (best-day marking helper only)

**Interfaces:**
- Consumes: `createCalendar` from `js/calendar.js`; `PERSON_COLORS`, `assignTileColors`, `buildAvailabilityByDay`, `dayAvailabilityLabel`, `buildViewModel`, `formatOption`, `getClient`, `validateResponseInput` from `js/app.js`.
- Produces: `bestDaysByDay(rows) -> Set<string>` exported from `js/app.js` — dates whose per-day unique-voter count equals the maximum (> 0); poll.js adds ★ to those day cells and renders legend + tiles.

- [ ] **Step 1: Write the failing test**

```js
test('bestDaysByDay marks days with the maximum unique-voter count', () => {
  const options = [
    { date: '2026-09-28', time: '18:00', label: null },
    { date: '2026-09-29', time: '18:00', label: null },
  ];
  const responses = [
    { name: 'Ana', selected: [0, 1], created_at: '2026-01-01' },
    { name: 'Ben', selected: [0], created_at: '2026-01-02' },
  ];
  const best = bestDaysByDay(buildViewModel(options, responses).rows);
  assert.deepEqual([...best], ['2026-09-28']);
});
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `node --test`
Expected: FAIL — no export named `bestDaysByDay`.

- [ ] **Step 3: Implement `bestDaysByDay` in `js/app.js`**

- [ ] **Step 4: Replace the checkbox list with the calendar in `poll.html` + `js/poll.js`**

- `poll.html`: swap the `<fieldset>` checkbox container for the same calendar block markup used by `index.html` (same IDs are fine — separate document), plus a `<ul id="tile-legend">` under the calendar and the same popover elements. Keep `#name-input`, `#respond-error`, `#submit-response` untouched.
- `js/poll.js`: build a `createCalendar` instance for the respond form; its `daySlots` start empty and drive the respondent's own selection exactly like the creator's. On every data load (initial, realtime INSERT, refresh), render per-day tiles into `.cal-day` cells for dates in `buildAvailabilityByDay` + `bestDaysByDay` (★), and the legend from `assignTileColors(model.names)`. Before first submit, only the respondent's own slots show (amber dots, creator style). Day-only days surface `dayAvailabilityLabel(null)` in the popover readout area; popover also lists, per offered slot that day, who is free (names joined) via the readout element. Submit converts `daySlots` to options indexes: a checked slot maps to the matching `{date,time}` option; for a day-only day (its option's `time` is `null`), marking the day counts as selecting that option — represent it in `daySlots` as date with `times: ['09:00–17:00']` pseudo-slot so the chip UI stays consistent. Zero selected after validation → existing inline error.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — 22/22.

- [ ] **Step 6: Commit**

```bash
git add poll.html js/poll.js js/app.js test/app.test.js style.css
git commit -m "feat: respond on the wall calendar with person tiles"
```

---

### Task 6: Heatmap day-only rows + Montserrat typography

**Files:**
- Modify: `js/poll.js` (heatmap row label only), `style.css`, `index.html`, `poll.html`
- Test: none new (label derives from already-tested `dayAvailabilityLabel`)

**Interfaces:**
- Consumes: `dayAvailabilityLabel` (Task 1).
- Produces: visual changes only.

- [ ] **Step 1: Label day-only heatmap rows with the 9–17 window**

In `js/poll.js` `renderResults`, the time-row label becomes `time === null ? dayAvailabilityLabel(null) : time` (replacing the current `'Any time'` fallback).

- [ ] **Step 2: Typography**

- Both HTML files: extend the Google Fonts `<link>` to load Montserrat 400/500/600/700 alongside Fraunces (single request, `family=Montserrat:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700`).
- `style.css`: `:root` `font-family` becomes Montserrat-first (`Montserrat, system-ui, ...`); Fraunces usage stays exactly where it is (h1, h2, popover title, `#cal-month`, `.heat-col-day`).
- Confirm `h1` is left-aligned over the content column (it already is via `.page-header`; no centering rules exist — verify visually in review).

- [ ] **Step 3: Full verification and commit**

Run: `node --check` on all four JS files + `node --test` (22/22) + `grep -n "Any time" js/poll.js` returns nothing.
Commit message: `feat: day-only heatmap labels and Montserrat typography`

---

### Task 7: Final verification

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: everything above.
- Produces: confidence report.

- [ ] **Step 1: Run the whole suite**

`node --test` — expected 22/22, pristine output.

- [ ] **Step 2: Syntax-check every JS file**

`node --check js/app.js && node --check js/calendar.js && node --check js/create.js && node --check js/poll.js && node --check js/config.js`

- [ ] **Step 3: Review-focus sweep**

Confirm each Review Focus line has a test or a documented manual check: empty app_config fails closed (error-mapping test), header-missing rejection (SQL review note in Task 2 report), two-month tile aggregation (buildAvailabilityByDay test), day-only no-precheck (readout test), duplicate names one tile (assignTileColors test).

- [ ] **Step 4: Commit any stragglers**

If all green and nothing to commit, state so and stop.
