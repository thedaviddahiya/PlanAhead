# PlanAhead

PlanAhead is a small, Doodle-style availability poll. Create a poll with a title and a list of dates or times, share the link, and let people mark every option that works for them. The static site is plain HTML, CSS, and JavaScript; Supabase stores polls and responses.

## Setup

1. Create a project at [Supabase](https://supabase.com/).
2. In the Supabase dashboard, open **SQL Editor**, create a new query, paste in [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the `polls`, `responses`, and `app_config` tables, their indexes, and the required anonymous RLS policies.

   **Existing deployments:** if your project already has the tables, run [`supabase/migration-extra-days.sql`](supabase/migration-extra-days.sql) instead — it adds the `extra` column (respondents can mark any day, even days outside the offered options) and relaxes the response check. Run [`supabase/migration-creation-password.sql`](supabase/migration-creation-password.sql) if you have not yet applied the creation-password migration.
3. Set the creation password the first time by running:

   ```sql
   insert into app_config (key, value) values ('creation_password_hash', crypt('NEW-PASSWORD', gen_salt('bf', 10)));
   ```

   To change it later, run:

   ```sql
   update app_config set value = crypt('NEW-PASSWORD', gen_salt('bf', 10)) where key = 'creation_password_hash';
   ```

   Creation fails for everyone until a password is set.
4. Realtime is added by the schema with `alter publication supabase_realtime add table public.responses`. Verify it in **Database → Realtime** and confirm that `responses` is enabled. Poll changes are not subscribed to; response inserts are.
5. Open [`js/config.js`](js/config.js) and replace the placeholder values with your project URL and anon key:

   ```js
   window.PLANAHEAD_CONFIG = {
     supabaseUrl: "https://your-project.supabase.co",
     supabaseAnonKey: "your-anon-key"
   };
   ```

   The anon key is intended for browser use. Do not put a Supabase service-role key in this file. Replace this file's placeholder values before deploying.
6. Push the repository to GitHub, then open **Settings → Pages**. Deploy from branch `main` and folder `/ (root)`.
7. Share links point at the respond page: with a repository named `availability-poll`, a share link looks like `https://username.github.io/availability-poll/poll.html?poll=abc12345`, where the poll ID is exactly 8 characters. Home-page links of the form `https://username.github.io/availability-poll/?poll=abc12345` redirect to the respond page automatically. If the repository is named differently, use that name in the path.

The schema intentionally permits anonymous clients to select polls and responses, create polls only with the configured creation password, and insert responses for an existing poll. It does not permit anonymous updates or deletes. Every response records at least one offered option (`selected`) or at least one day outside the options (`extra`), and the database validates poll ID, title, description, option shape, and response name lengths.

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
