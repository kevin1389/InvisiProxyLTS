# Live Chat — one-time setup

The chat widget is already built into the site: a 💬 button in the bottom-left
corner opens a hideable panel with a Name field, a Message field, and Send.
The panel header's ❮ button tucks the chat into a slim tab on the left edge —
click the tab to bring it back. Everyone visiting the site shares the same
conversation.

Messages are stored in a free **Supabase** (Postgres) project so they persist
for all visitors, and a scheduled job on Supabase wipes the chat every day at
**12:00 PM Eastern** (it auto-adjusts for daylight saving time).

## 1. Create the database (2 minutes)

1. Go to [supabase.com](https://supabase.com) → sign up free → **New project**.
2. Pick any name/password — nothing here is secret-sensitive.
3. Open **SQL Editor** → **New query**, paste *all* of the SQL below, click **Run**.

```sql
-- ── InvisiProxy live chat ─────────────────────────────────────────
-- 1) Table
create table if not exists public.iv_chat (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 32),
  message text not null check (char_length(message) between 1 and 500)
);

-- 2) Row-level security: visitors may read + post, never edit or delete
alter table public.iv_chat enable row level security;

drop policy if exists "iv_chat_read" on public.iv_chat;
create policy "iv_chat_read" on public.iv_chat
  for select to anon using (true);

drop policy if exists "iv_chat_post" on public.iv_chat;
create policy "iv_chat_post" on public.iv_chat
  for insert to anon with check (true);

-- Table grants for the public (anon) role
revoke all on public.iv_chat from anon;
grant select, insert on public.iv_chat to anon;

-- 3) Daily wipe at 12:00 PM Eastern (DST-safe, works on any pg_cron version)
create extension if not exists pg_cron;

-- Runs at both 4:00 PM and 5:00 PM UTC, and only deletes when it is actually
-- noon in New York — so it tracks daylight saving automatically.
select cron.schedule(
  'clear-iv-chat-daily-noon-et',
  '0 16,17 * * *',
  $job$
    delete from public.iv_chat
    where extract(hour from (now() at time zone 'America/New_York')) = 12;
  $job$
);
```

## 2. Paste your keys

In Supabase: click the green **Connect** button (top of the dashboard), or open
**Settings → API Keys**. Copy two values:

- **Project URL** — looks like `https://abcd1234.supabase.co`
- **API key** — either the **publishable key** (starts with `sb_publishable_`) or the
  legacy **anon public** key (a long `eyJ...` string). Both work here.

> ⚠️ Never use the **secret** key (`sb_secret_...`) or `service_role` key — that one
> bypasses all security rules and must stay private.

Open `views/assets/js/chat.js` and replace the two placeholders at the top:

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

Then run `pnpm run build` (or just save — the Freebuff preview rebuilds).

## 3. Done

Open the site, click the 💬 bubble in the bottom-left, set a name, and send a
message. Other visitors see it within ~3 seconds, and can reply.

### Notes

- The **anon key is safe to expose** in client code — row-level security is
  what actually protects the table (read + insert only; no anonymous edits,
  deletes, or wipes).
- To remove a message manually: Supabase dashboard → **Table Editor → iv_chat**.
- The daily 12 PM ET clear runs entirely on Supabase (pg_cron), so it fires
  even when nobody is visiting the site.
- Free tier: 500 MB database — the chat wipes itself daily, so it stays tiny.
