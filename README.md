# PlanAhead

A Doodle-style availability poll. One person opens the site, picks dates on a wall calendar and sets times on a 9–21 ruler, and shares the link. Respondents mark their own availability on the same calendar; every day cell shows one colored tile per person who is free that day, so the calendar itself is the results view.

Static HTML, CSS, and JavaScript — no build step, no accounts. Supabase stores polls and responses; GitHub Pages hosts the site.

## Features

- **Creation password** — only people with the password can create polls; enforced server-side by a row-level security policy, remembered in the browser after first use.
- **Wall-calendar picker** — click a day to mark the whole day free (09:00–17:00), second click clears it; the ruler below fine-tunes exact times, off-grid times still offered by a poll appear as chips.
- **Respond on any day** — respondents may also mark days the poll never offered; these are stored separately and shown in the calendar like any other availability.
- **Creator is a participant** — the poll creator enters a name and marks their own availability; their response is recorded like everyone else's.
- **Live results** — colored tiles per person in each day cell, plus a legend; updates in real time as people respond.
- **Day-only option** — a day marked with no times means available 09:00–17:00.

## Quick start

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor (+ the one-time migrations listed in the full guide).
2. Copy your project URL and anon key into [`js/config.js`](js/config.js).
3. Push to GitHub and enable Pages from `main`.

The full setup guide — including the creation-password setup, existing-deployment migrations, and troubleshooting — lives in [docs/README.md](docs/README.md).

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` / `js/create.js` | Poll creation flow |
| `poll.html` / `js/poll.js` | Respond flow and live tile results |
| `js/calendar.js` | Shared wall-calendar + time-ruler component |
| `js/app.js` | Pure helpers (tested) and Supabase client setup |
| `js/config.js` | Your Supabase URL and anon key |
| `style.css` | Design system (amber accent, Fraunces + Montserrat) |
| `supabase/` | Schema + idempotent migrations |
| `docs/` | Full setup guide and design docs |

## Local testing

Serve the files over HTTP (ES modules need it):

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/`. Unit tests: `npm test` (or bare `node --test`).
