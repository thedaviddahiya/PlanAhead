# PlanAhead Phase 2 Final Fix Report

## Status

Implemented both merge-blocking fixes from the final whole-branch review.

## Finding 1: Day-only creation

### Root cause

The shared calendar represented an unselected day as an absent `daySlots` map entry. The Done action only closed the popover, so zero-slot selections stayed absent. `buildOptionsFromDays` also flattened only non-empty `times` arrays, making a day-only option impossible to serialize from the creator UI.

### Changes

- Added a red-green regression test for `buildOptionsFromDays({ times: [] })`.
- Empty `times` arrays now serialize as `{ date, time: null, label: null }`.
- Done with zero chosen slots stores `times: []` as a deliberate day marker.
- Clear day still deletes the map entry.
- Calendar cells use map membership, rather than slot count, for the filled state and dot rendering, so day-only entries remain visibly selected.
- Creator summary chips render day-only entries with `09:00–17:00` and retain the existing remove behavior.

## Finding 2: Post-submit calendar visibility

### Root cause

Successful response submission set `#respond-panel.hidden = true`. That panel contains the calendar, respondent tiles, and legend, so the overview disappeared along with the response controls.

### Changes

- The response panel remains visible after successful submission.
- Only the respondent name label/input and submit button are hidden.
- The existing thank-you panel is still shown.
- Results refresh remains unchanged, preserving the respondent's own picks, other tiles, legend, stars, and heatmap.

## Verification

- `node --test`: 24/24 passing.
- `node --check js/app.js`: passing.
- `node --check js/calendar.js`: passing.
- `node --check js/create.js`: passing.
- `node --check js/poll.js`: passing.
- `git diff --check`: passing.

## Concerns

No known concerns. Browser-level interaction tests are not present in the repository; the pure serialization regression and JavaScript syntax checks pass.
