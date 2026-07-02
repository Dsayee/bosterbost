# Boster Bost Cloudflare D1 Database

Cloudflare D1 database created:

- Account: `Darlingtonsayee@icloud.com's Account`
- Account ID: `a42b60a6c5b64ba1571e6d185906a761`
- Database name: `boster-bost`
- Database ID: `80a3a3d7-9584-42f6-8482-46f5fceaa2aa`
- Region: `WEUR`

## Migration Files

- Schema: `migrations/0001_cloudflare_d1_initial.sql`
- Latest exported data file: `cloudflare-d1-data.sql`
- Export script: `scripts/export-mysql-to-d1.mjs`
- Wrangler config: `wrangler.toml`

## Useful Commands

Apply schema:

```bash
corepack pnpm run cloudflare:d1:schema
```

Export current XAMPP MySQL data:

```bash
corepack pnpm run cloudflare:d1:export
```

Import exported data into Cloudflare D1:

```bash
corepack pnpm run cloudflare:d1:import
```

Verify counts:

```bash
node_modules/.bin/wrangler.CMD d1 execute boster-bost --remote --command "SELECT COUNT(*) AS users FROM users;"
node_modules/.bin/wrangler.CMD d1 execute boster-bost --remote --command "SELECT COUNT(*) AS orders FROM orders;"
node_modules/.bin/wrangler.CMD d1 execute boster-bost --remote --command "SELECT COUNT(*) AS support_tickets FROM support_tickets;"
node_modules/.bin/wrangler.CMD d1 execute boster-bost --remote --command "SELECT COUNT(*) AS wallet_transactions FROM wallet_transactions;"
```

## Imported Counts

The first Cloudflare import completed successfully with:

- `users`: 20
- `orders`: 8
- `support_tickets`: 15
- `wallet_transactions`: 19

## App Connection

The database has been moved to Cloudflare D1 and the local Next.js backend is now configured to use it with:

```env
DATABASE_PROVIDER=cloudflare-d1
```

The required Cloudflare values are stored in `.env.local`:

```env
DATABASE_PROVIDER=cloudflare-d1
CLOUDFLARE_ACCOUNT_ID=a42b60a6c5b64ba1571e6d185906a761
CLOUDFLARE_D1_DATABASE_ID=80a3a3d7-9584-42f6-8482-46f5fceaa2aa
CLOUDFLARE_D1_API_TOKEN=your-cloudflare-d1-api-token
```

Do not commit `.env.local` or the API token.

Verified locally:

- `GET /api/backend/status` returns `cloudflare-d1`.
- `POST /api/auth/login` reaches D1 and returns the normal invalid-login response for wrong credentials.
