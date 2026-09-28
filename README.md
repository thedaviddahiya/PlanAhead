# PlanAhead

PlanAhead is a small, Doodle-style availability poll. Create a poll with a title and a list of dates or times, share the link, and let people mark every option that works for them. The static site is plain HTML, CSS, and JavaScript; Supabase stores polls and responses.

## Setup

1. Create a project at [Supabase](https://supabase.com/).
2. In the Supabase dashboard, open **SQL Editor**, create a new query, paste in [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the `polls` and `responses` tables, their `poll_id` index, and the required anonymous RLS policies.
3. Realtime is added by the schema with `alter publication supabase_realtime add table public.responses`. Verify it in **Database → Realtime** and confirm that `responses` is enabled. Poll changes are not subscribed to; response inserts are.
4. Open [`js/config.js`](js/config.js) and replace the placeholder values with your project URL and anon key:

   ```js
   window.PLANAHEAD_CONFIG = {
     supabaseUrl: "https://your-project.supabase.co",
     supabaseAnonKey: "your-anon-key"
   };
   ```

   The anon key is intended for browser use. Do not put a Supabase service-role key in this file. Replace this file's placeholder values before deploying.
5. Push the repository to GitHub, then open **Settings → Pages**. Deploy from branch `main` and folder `/ (root)`.
6. Share links point at the respond page: with a repository named `availability-poll`, a share link looks like `https://username.github.io/availability-poll/poll.html?poll=abc12345`, where the poll ID is exactly 8 characters. Home-page links of the form `https://username.github.io/availability-poll/?poll=abc12345` redirect to the respond page automatically. If the repository is named differently, use that name in the path.

The schema intentionally permits anonymous clients to select polls and responses, insert polls, and insert responses for an existing poll. It does not permit anonymous updates or deletes. Responses must contain at least one selected option, and the database validates poll ID, title, description, option shape, and response name lengths.

## Local testing

From the repository root, serve the files over HTTP so ES modules and Supabase requests work:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/` in a browser. For a configured local test, first replace the values in `js/config.js`; use a deployed GitHub Pages URL for share links in production.

The full create, share, two-response, and live-results browser E2E check requires real Supabase keys and is an owner-manual verification step.

## Project files

- `index.html` and `js/create.js` contain the poll creation flow.
- `poll.html` and `js/poll.js` contain response submission and live results.
- `style.css` contains the complete responsive design system.
- `supabase/schema.sql` contains the database tables, constraints, RLS policies, and realtime publication change.
