# Final Review Fix Report

## Findings

1. **Public schema option validation**
   - Changed `supabase/schema.sql:9-15` to require a non-empty array and reject non-object entries, missing/non-string/non-`YYYY-MM-DD` dates, and non-null times that are not valid `HH:MM` strings.
   - No dedicated SQL test harness is available in this worktree; the required schema constraint grep passed.

2. **Duplicate selection counts**
   - Changed `js/app.js:123-130` to deduplicate each response's selected indexes before incrementing counts or voters.
   - Covered by `buildViewModel deduplicates repeated selected indexes per response` in `test/app.test.js:114-121`.

3. **Legacy date rendering**
   - Changed `js/app.js:87-103` so non-empty invalid date strings render as the raw date part, with the existing date/time separator rules.
   - Covered by `formatOption renders fixed UTC calendar dates without shifting them` in `test/app.test.js:88-96`.

4. **Not-found home link**
   - Added the styled `Back to PlanAhead` link at `poll.html:19-24`.
   - The required grep found the link.

5. **Grouped response options**
   - Changed `js/poll.js:38-66` to group checkboxes by first-seen date, preserve option order, share groups for identical dates, and place date-less options under `Ungrouped` at their original position.
   - Checkbox names, values, labels, and `response-option` class remain unchanged.
   - Added minimal heading styling at `style.css:210-220`.

6. **Authenticated RLS policies**
   - Added equivalent authenticated select/insert policies for both tables at `supabase/schema.sql:37-61`.
   - The required policy grep passed.

## Verification

- `node --test`: 12 tests passed, 0 failed.
- `node --check js/app.js js/create.js js/poll.js js/config.js`: passed with no output.
- `grep -nE 'Back to PlanAhead|jsonb_array_length|like_regex|authenticated' poll.html supabase/schema.sql`: found the home link, option constraints, and all authenticated policies.
- `git diff --check`: passed with no output.

## Scoped Re-review Fix

- Changed `js/app.js:95-96` so a non-empty-after-trim invalid date is detected using `trim()` but rendered using the raw stored string; whitespace-only dates remain absent and render valid times alone.
- Extended `formatOption renders fixed UTC calendar dates without shifting them` in `test/app.test.js:88-97` for invalid dates with and without time, whitespace-only dates with time, and null dates with time.
- `node --test`: 12 tests passed, 0 failed.
- `node --check js/app.js`: passed with no output.
- `git diff --check`: passed with no output.
