// One-time migration: copies rows from the Hatch artifact's app.db into the
// standalone panel's database (Turso in production, local file for testing).
//
// Usage:
//   TURSO_DATABASE_URL=libsql://xxx.turso.io TURSO_AUTH_TOKEN=xxx \
//     node scripts/migrate-from-artifact-db.mjs
//
// Optional: SOURCE_DB=/path/to/app.db  (defaults to the artifact's app.db)
//
// Copies: users, services, settings, fund_requests, ledger_entries, orders.
// Skips: sessions (old login tokens are not carried over).
// This script NEVER prints secret values (API keys, password hashes) —
// it only logs row counts per table.
import { createClient } from "@libsql/client";

const SOURCE_DB = process.env.SOURCE_DB || `${process.env.HOME}/workspace/ts-spaces/sajeel-rajpoot-social-media-services/app.db`;

const targetUrl = process.env.TURSO_DATABASE_URL;
const targetToken = process.env.TURSO_AUTH_TOKEN;
if (!targetUrl) {
  console.error("TURSO_DATABASE_URL is not set. Set it to your Turso URL (or file:./data/local.db for a local test).");
  process.exit(1);
}

const source = createClient({ url: `file:${SOURCE_DB}` });
const target = targetUrl.startsWith("file:")
  ? createClient({ url: targetUrl })
  : createClient({ url: targetUrl, authToken: targetToken });

const TABLES = {
  users: ["id", "name", "email", "password_hash", "role", "balance_paisa", "created_at"],
  services: ["id", "provider_service_id", "platform", "name", "provider_rate_usd", "price_pkr", "min_quantity", "max_quantity", "refill", "cancel", "active"],
  settings: ["key", "value", "updated_at"],
  fund_requests: ["id", "user_id", "amount_paisa", "tid", "status", "note", "reviewed_by", "reviewed_at", "created_at"],
  ledger_entries: ["id", "user_id", "type", "amount_paisa", "reference_type", "reference_id", "note", "created_at"],
  orders: ["id", "user_id", "service_id", "provider_order_id", "link", "quantity", "charged_paisa", "provider_cost_paisa", "profit_paisa", "status", "provider_status", "remains", "error_message", "last_synced_at", "created_at", "updated_at"],
};

async function main() {
  console.log(`Migrating from ${SOURCE_DB}`);
  const shownTarget = targetUrl.startsWith("file:") ? targetUrl : "[turso-host-redacted]";
  console.log(`Target: ${shownTarget}`);
  for (const [table, columns] of Object.entries(TABLES)) {
    const cols = columns.join(", ");
    const result = await source.execute(`SELECT ${cols} FROM ${table}`);
    const placeholders = columns.map(() => "?").join(", ");
    let copied = 0;
    // Insert in batches of 50.
    for (let i = 0; i < result.rows.length; i += 50) {
      const batch = result.rows.slice(i, i + 50).map((row) => ({
        sql: `INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${placeholders})`,
        // Values go straight to the target DB; nothing is logged below.
        args: columns.map((c) => row[c]),
      }));
      await target.batch(batch);
      copied += batch.length;
    }
    // Verify with a count — the only thing we print about the data.
    const check = await target.execute(`SELECT COUNT(*) AS n FROM ${table}`);
    console.log(`${table}: copied ${copied} rows (target now has ${check.rows[0].n})`);
  }
  console.log("Migration complete. Sessions were intentionally skipped — everyone signs in again.");
}

main().catch((err) => {
  console.error("Migration failed:", err && err.message ? err.message : err);
  process.exit(1);
});
