// Drizzle schema for the standalone SMM panel (SQLite via libsql/Turso).
// Mirrors the Hatch artifact schema exactly — same table and column names.
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "customer"] }).notNull().default("customer"),
  balancePaisa: integer("balance_paisa").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const services = sqliteTable("services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  providerServiceId: text("provider_service_id").notNull().unique(),
  platform: text("platform").notNull(),
  name: text("name").notNull(),
  providerRateUsd: real("provider_rate_usd").notNull(),
  pricePkr: integer("price_pkr").notNull(),
  minQuantity: integer("min_quantity").notNull(),
  maxQuantity: integer("max_quantity").notNull(),
  refill: integer("refill", { mode: "boolean" }).notNull().default(false),
  cancel: integer("cancel", { mode: "boolean" }).notNull().default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const fundRequests = sqliteTable("fund_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amountPaisa: integer("amount_paisa").notNull(),
  tid: text("tid").notNull().unique(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  note: text("note"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const ledgerEntries = sqliteTable("ledger_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["fund_credit", "order_debit", "order_refund", "admin_adjustment"] }).notNull(),
  amountPaisa: integer("amount_paisa").notNull(),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  note: text("note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  serviceId: integer("service_id").notNull().references(() => services.id),
  providerOrderId: text("provider_order_id"),
  link: text("link").notNull(),
  quantity: integer("quantity").notNull(),
  chargedPaisa: integer("charged_paisa").notNull(),
  providerCostPaisa: integer("provider_cost_paisa").notNull(),
  profitPaisa: integer("profit_paisa").notNull(),
  status: text("status", { enum: ["submitting", "pending", "in_progress", "completed", "partial", "canceled", "failed"] }).notNull().default("submitting"),
  providerStatus: text("provider_status"),
  remains: integer("remains"),
  errorMessage: text("error_message"),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
