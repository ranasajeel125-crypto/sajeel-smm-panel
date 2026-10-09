// Database connection for the standalone SMM panel.
// Uses @libsql/client (Turso) so the same SQLite schema runs locally
// (file: URL) and in production (libsql:// URL + auth token).
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema.mjs";

const url = process.env.TURSO_DATABASE_URL || "file:./data/local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

if (url.startsWith("file:")) {
  const filePath = url.slice("file:".length);
  const dir = path.dirname(filePath);
  if (dir && dir !== "." && dir !== "") fs.mkdirSync(dir, { recursive: true });
} else if (!process.env.TURSO_DATABASE_URL) {
  console.log("[db] TURSO_DATABASE_URL not set — using local SQLite file ./data/local.db");
}

export const client = createClient(url.startsWith("file:") ? { url } : { url, authToken });
export const db = drizzle(client, { schema });

// Create tables on fresh databases. Safe to run on every boot.
export async function initDb() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      balance_paisa INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_service_id TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      provider_rate_usd REAL NOT NULL,
      price_pkr INTEGER NOT NULL,
      min_quantity INTEGER NOT NULL,
      max_quantity INTEGER NOT NULL,
      refill INTEGER NOT NULL DEFAULT 0,
      cancel INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS fund_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_paisa INTEGER NOT NULL,
      tid TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount_paisa INTEGER NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      note TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id),
      provider_order_id TEXT,
      link TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      charged_paisa INTEGER NOT NULL,
      provider_cost_paisa INTEGER NOT NULL,
      profit_paisa INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitting',
      provider_status TEXT,
      remains INTEGER,
      error_message TEXT,
      last_synced_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ];
  for (const sql of statements) {
    await client.execute(sql);
  }
}
