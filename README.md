# ونس (Wanas)

Arabic (RTL, Egyptian) 1:1 chat. Static front end (GitHub Pages) + Supabase (Postgres, Auth, Realtime, Edge Function).

- Sign up / sign in with a Wanas ID + password (no email). `supabase/functions/signup` creates a normal Supabase Auth user with a synthetic address; the browser then signs in with `signInWithPassword`.
- Row Level Security on `profiles`, `contacts`, `messages` (see `supabase/schema.sql`). Realtime `postgres_changes` are filtered by those policies per user.
- Contacts are added by Wanas ID through `add_contact()` (mutual). Images are resized in the browser and stored in `messages.body`, readable only by sender and recipient.
- Presence: `profiles.last_seen` heartbeat every 20 s; online = seen in the last 45 s.
