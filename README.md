# SMM Panel — Public Build

Standalone public build of the "Sajeel Rajpoot Social Media Services" reseller
panel. Express server + React client + Turso (libsql) database. Deployable on
Render's free tier.

## 1. Create the database (free)

1. Sign up at https://turso.tech and install the Turso CLI (or use the dashboard).
2. Create a database:
   ```
   turso db create smm-panel
   ```
3. Get the connection details:
   ```
   turso db show smm-panel --url
   turso db tokens create smm-panel
   ```

## 2. Deploy on Render (free)

1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint**, point it at the repo (uses `render.yaml`).
3. Set the environment variables in the Render dashboard:
   - `TURSO_DATABASE_URL` — e.g. `libsql://smm-panel-xxxx.turso.io`
   - `TURSO_AUTH_TOKEN` — the token from step 1
   - `RECOVERY_SECRET` — a long random string, e.g. `openssl rand -hex 32`
4. Deploy. Render runs `npm install && npm run build`, then `npm start`.

## 3. Migrate existing data (one time)

Copy users, services, settings (provider key + JazzCash), fund requests,
ledger entries and orders from the original panel database:

```
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
  node scripts/migrate-from-artifact-db.mjs
```

The script only prints row counts — never secret values. Old login sessions
are skipped, so everyone signs in again after migration.

## 4. First signup becomes the admin

Open the deployed URL and create the first account — it automatically becomes
the owner/admin account. Every signup after that creates a customer account.

The "Forgot password?" link on the sign-in screen requires the
`RECOVERY_SECRET` value you set in step 2.

## Local development

```
npm install
npm run build        # builds the React client into client/dist
npm start            # serves API + client on http://localhost:3000
```

Without `TURSO_DATABASE_URL` the server uses a local SQLite file at
`./data/local.db` (created on first run).

## Pricing model

Unchanged from the original panel: every service is priced at
`ceil(provider_rate_usd × 277 + 150)` PKR per 1,000 units — a flat Rs. 150
margin per 1,000 on top of provider cost.
