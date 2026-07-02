# Boster Bost Cloud Backend

This app supports these backend modes:

- Local fallback: XAMPP/MariaDB when `.env.local` uses `DATABASE_PROVIDER=mysql`
- Cloud database migration target: Cloudflare D1. See `CLOUDFLARE_D1.md`.
- Cloud mode: Supabase Postgres through the Next.js API routes

## Cloudflare D1

The Cloudflare D1 database has been created and the XAMPP data has been imported.

- Database name: `boster-bost`
- Database ID: `80a3a3d7-9584-42f6-8482-46f5fceaa2aa`
- Wrangler config: `wrangler.toml`
- Schema: `migrations/0001_cloudflare_d1_initial.sql`
- Data export/import file: `cloudflare-d1-data.sql`

For commands and next steps, open `CLOUDFLARE_D1.md`.

## Supabase Setup

1. Create a free Supabase project.
2. Open the Supabase SQL editor.
3. Run the SQL in `supabase-schema.sql`.
4. Copy `.env.example` to `.env.local`.
5. Add your values:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

6. Restart the Next.js server:

```bash
npm.cmd run dev
```

When those env vars exist, users, sessions, and orders are stored in Supabase. The local development setup uses XAMPP/MariaDB.

## Dashboard Management

Open `/admin` after logging in as an admin.

Admin access is controlled by the `is_admin` and `access_level` fields.

Admin can:

- View all users
- View all order requests
- Change order statuses
- Change user roles
- Grant or remove admin access
- View wallet balances

Customers can:

- Select a display currency
- Add funds in supported currencies
- See wallet balance converted from the RWF source balance
- Place catalog orders priced in RWF per 1,000 units
- Spend wallet funds automatically when an order is submitted

## Currency Model

The source balance is stored in RWF. Display currencies use the static conversion table in `lib/catalog.js`.

Supported display/deposit currencies:

- RWF
- USD
- EUR
- GBP
- KES
- UGX
- TZS
- NGN

## Backend Routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/wallet`
- `POST /api/wallet`
- `GET /api/admin`
- `PATCH /api/admin/orders/:id`
- `PATCH /api/admin/users/:id`

## Important Security Note

Keep `SUPABASE_SERVICE_ROLE_KEY` only in `.env.local` or server hosting environment variables. Never expose it in client-side code or public repositories.
