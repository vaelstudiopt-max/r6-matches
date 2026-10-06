# R6 Matches

A private-community Rainbow Six Siege scrim site with four 5v5 queues, captain drafting, map vetoes, BO1/BO3 series, Elo rankings, and Discord voice splitting.

## Stack

- Next.js 15, React 19, TypeScript
- Supabase Auth, Postgres, Row Level Security, Realtime
- An always-on Discord.js worker

## Local setup

1. Install Node.js 22 or newer and pnpm. Run `pnpm install`.
2. Create a Supabase project. Run the SQL migrations in filename order through the Supabase SQL editor or migrations CLI.
3. Create a Discord application and bot. Install the bot in your server with **Manage Channels**, **Move Members**, **View Channels**, and **Connect** permissions. The bot uses the standard **Guilds** and **Guild Voice States** gateway intents. Place its role high enough for it to manage the match channels.
4. Enable the Discord provider in Supabase Auth using the Discord application's client ID and secret. Add the app's `/profile` URL to Supabase's redirect allow list. Enable email/password sign-in and email confirmation.
5. Copy `.env.example` to `.env.local` and fill every value. Keep the service role key and bot token server-side only.
6. Run `pnpm dev` for the website and `pnpm bot` in a separate terminal for the worker.
7. Register your own account. In Supabase SQL Editor, run `update public.profiles set is_admin = true where id = 'YOUR_AUTH_USER_UUID';` once. In the website Admin page, verify members by checking their Discord user IDs, then set the General voice channel ID, optional match-channel category ID, and staff role IDs.

The SQL migration seeds the 2026 competitive map pool. Keep exactly nine maps active before starting a match. The admin can add inactive maps and adjust the active set for future matches; matches already started keep their original pool.

## Deployment

- Deploy the Next.js project to Vercel with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_BOT_TOKEN`, and `DISCORD_GUILD_ID`.
- Deploy an always-on Railway service from the same repository with the same variables. Set its start command to `pnpm bot`. Do not scale it above one replica without adding a distributed job lock.
- Add the production origin to Supabase Auth's allowed redirect URLs, and use the Supabase callback URL in the Discord Developer Portal.

## Match flow

Each player connects a Discord identity or gives a moderator their Discord user ID, enters a Ubisoft PC name, and joins one queue after either a live server membership check or staff verification. The tenth player triggers a 30-second ready check. Captains are selected at random from players who opted in. The draft uses A, B, B, A, A, B, A, B. When teams are set, all ten enter General voice. The worker creates private channels, moves the two teams, and opens the map veto. A representative from each team reports or confirms each map. A series result changes every player's Elo once. An admin resolves disputes and forfeits.

If the bot cannot split voice, the match remains in `waiting_voice` and shows the error. Fix permissions or configuration, then use **Retry Voice** in Admin. On match completion or cancellation, the worker returns connected players to General and removes the temporary channels.

## Security notes

The browser uses only the public Supabase key. Queue and match mutations are transactional database functions that validate the caller; direct table writes are restricted. Staff can manually approve a Discord user ID through an admin-only database function; the player cannot approve themselves. Without that approval, the website checks guild membership using the bot token server-side before queue entry and again at the ready check. Discord administrators and the server owner can access private channels regardless of permission overwrites.
