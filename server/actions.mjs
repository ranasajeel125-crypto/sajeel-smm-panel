// Business logic for the standalone SMM panel — a plain-JS port of the
// Hatch artifact's server actions. Every action is an async function
// `(args) => responseObject`, exposed by index.mjs as POST /api/<name>.
//
// Hatch-only pieces replaced:
// - ctx.db()            -> shared drizzle `db` (libsql/Turso)
// - ctx.viewer?.isOwner  -> first-ever signup becomes admin; password recovery
//                          is gated by the RECOVERY_SECRET env var instead
// - ctx.invalidateQueries() -> removed (client refetches explicitly)
// - privileged catalog fetch -> direct fetch() with a timeout
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "./db.mjs";
import * as schema from "./schema.mjs";

const API_URL = "https://www.bkpanel.com/api/v2"; // BK Panel switch — verified live 2026-10-22: /api/v2 + `key` param parses correctly ("incorrect API key" for bad keys); /api + apiKey is a dead legacy path ("action is not specfied")
const API_KEY_PARAM = "key"; // BK Panel v2 expects `key` (same as PakSMM did)
const USD_TO_PKR = 277;
const PROVIDER_KEY_SETTING = "provider_api_key";
const PROVIDER_CONNECTED_AT_SETTING = "provider_connected_at";
const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function sha256(value) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, key, 256);
  return `pbkdf2$120000$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  const [kind, iterationsText, saltHex, expectedHex] = stored.split("$");
  if (kind !== "pbkdf2" || !iterationsText || !saltHex || !expectedHex) return false;
  const iterations = Number(iterationsText);
  if (!Number.isFinite(iterations) || iterations < 100000) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations }, key, 256);
  const actual = new Uint8Array(bits);
  const expected = hexToBytes(expectedHex);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}

async function createSession(userId) {
  const raw = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  await db.insert(schema.sessions).values({
    userId,
    tokenHash: await sha256(raw),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return raw;
}

async function authUser(token) {
  if (!token) return null;
  const rows = await db
    .select({ user: schema.users, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.tokenHash, await sha256(token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return row.user;
}

async function requireAdmin(token) {
  const user = await authUser(token);
  return user?.role === "admin" ? user : null;
}

async function getProviderKey() {
  const rows = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, PROVIDER_KEY_SETTING)).limit(1);
  return rows[0]?.value ?? null;
}

async function saveProviderCredential(key) {
  const now = new Date();
  await db.batch([
    db.insert(schema.settings).values({ key: PROVIDER_KEY_SETTING, value: key, updatedAt: now }).onConflictDoUpdate({ target: schema.settings.key, set: { value: key, updatedAt: now } }),
    db.insert(schema.settings).values({ key: PROVIDER_CONNECTED_AT_SETTING, value: now.toISOString(), updatedAt: now }).onConflictDoUpdate({ target: schema.settings.key, set: { value: now.toISOString(), updatedAt: now } }),
  ]);
}

async function providerRequest(params, keyOverride) {
  const key = keyOverride ?? await getProviderKey();
  if (!key) return { ok: false, error: "Provider connection is not active. Ask the owner to reconnect it." };
  try {
    const body = new URLSearchParams({ [API_KEY_PARAM]: key, ...params });
    const response = await fetch(API_URL, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) return { ok: false, error: `Provider returned HTTP ${response.status}.` };
    const data = await response.json();
    if (!data || typeof data !== "object") return { ok: false, error: "Provider returned an unreadable response." };
    const record = data;
    if (typeof record.error === "string") return { ok: false, error: record.error };
    return { ok: true, data: record };
  } catch {
    return { ok: false, error: "Provider could not be reached. Try again shortly." };
  }
}

function providerFlag(value) {
  return value === true || value === 1 || value === "1" || (typeof value === "string" && value.toLowerCase() === "true");
}

function parseProviderService(value) {
  if (!value || typeof value !== "object") return null;
  const row = value;
  const service = typeof row.service === "string" || typeof row.service === "number" ? String(row.service) : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const category = typeof row.category === "string" && row.category.trim() ? row.category.trim() : "Other services";
  const rate = typeof row.rate === "number" ? row.rate : Number(row.rate);
  const min = typeof row.min === "number" ? row.min : Number(row.min);
  const max = typeof row.max === "number" ? row.max : Number(row.max);
  if (!service || !name || !Number.isFinite(rate) || rate < 0 || !Number.isInteger(min) || min < 1 || !Number.isInteger(max) || max < min) return null;
  return { service, name, category, rate, min, max, refill: providerFlag(row.refill), cancel: providerFlag(row.cancel) };
}

async function fetchProviderServices(keyOverride) {
  const key = keyOverride ?? await getProviderKey();
  if (!key) return { ok: false, error: "Provider connection is not active. Ask the owner to reconnect it." };
  try {
    const formBody = new URLSearchParams({ [API_KEY_PARAM]: key, action: "services" }).toString();
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody,
      signal: AbortSignal.timeout(120000),
    });
    const body = await response.text();
    if (!response.ok) return { ok: false, error: `Provider returned HTTP ${response.status}.` };
    const data = JSON.parse(body);
    if (!Array.isArray(data)) {
      const error = data && typeof data === "object" && typeof data.error === "string" ? String(data.error) : "Provider returned an unreadable service list.";
      return { ok: false, error };
    }
    const services = data.map(parseProviderService).filter((item) => item !== null);
    if (services.length === 0) return { ok: false, error: "Provider returned no usable services." };
    return { ok: true, services };
  } catch {
    return { ok: false, error: "Provider services could not be reached. Try again shortly." };
  }
}

function tieredMargin(rateUsd, serviceName) {
  // Followers always get Rs.150 profit (user's rule)
  const name = (serviceName || "").toLowerCase();
  if (name.includes("follower")) return 150;
  // Margin based on provider cost in PKR (user's structure):
  const costPkr = rateUsd * 277;
  if (costPkr <= 100) return 50;    // cost up to Rs.100 → Rs.50 profit
  if (costPkr <= 400) return 100;   // cost Rs.100-400 → Rs.100 profit
  if (costPkr <= 2000) return 150;  // cost Rs.400-2000 → Rs.150 profit
  return 500;                        // cost above Rs.2000 → Rs.500 profit
}

async function syncAllProviderServices(keyOverride) {
  const result = await fetchProviderServices(keyOverride);
  if (!result.ok) return { ok: false, message: result.error };
  const ids = new Set(result.services.map((service) => service.service));
  const statements = result.services.map((service) => db.insert(schema.services).values({
    providerServiceId: service.service,
    platform: service.category,
    name: service.name,
    providerRateUsd: service.rate,
    pricePkr: Math.ceil(service.rate * USD_TO_PKR + tieredMargin(service.rate, service.name)),
    minQuantity: service.min,
    maxQuantity: service.max,
    refill: service.refill,
    cancel: service.cancel,
    active: true,
  }).onConflictDoUpdate({
    target: schema.services.providerServiceId,
    set: {
      platform: service.category,
      name: service.name,
      providerRateUsd: service.rate,
      pricePkr: Math.ceil(service.rate * USD_TO_PKR + tieredMargin(service.rate, service.name)),
      minQuantity: service.min,
      maxQuantity: service.max,
      refill: service.refill,
      cancel: service.cancel,
      active: true,
    },
  }));
  for (let index = 0; index < statements.length; index += 40) {
    const [first, ...rest] = statements.slice(index, index + 40);
    if (first) await db.batch([first, ...rest]);
  }
  const existing = await db.select({ id: schema.services.id, providerServiceId: schema.services.providerServiceId }).from(schema.services);
  const missingIds = existing.filter((row) => !ids.has(row.providerServiceId)).map((row) => row.id);
  for (const id of missingIds) await db.update(schema.services).set({ active: false }).where(eq(schema.services.id, id));
  return { ok: true, message: `${result.services.length.toLocaleString()} provider services synced with the Rs. 150 per 1,000 margin.`, imported: result.services.length, active: result.services.length };
}

function serviceRow(row) {
  return { id: row.id, provider_service_id: row.providerServiceId, platform: row.platform, name: row.name, provider_rate_usd: row.providerRateUsd, price_pkr: row.pricePkr, min: row.minQuantity, max: row.maxQuantity, refill: row.refill, cancel: row.cancel };
}

// Validates request args with zod; returns { ok:false, message } on bad input.
function withValidation(shape, handler) {
  return async (rawArgs) => {
    let args;
    try {
      args = shape.parse(rawArgs ?? {});
    } catch {
      return { ok: false, message: "Invalid request." };
    }
    return handler(args);
  };
}

export const Actions = {
  getPublic: withValidation(z.object({}), async () => {
    const [userRows, serviceRows, settingsRows] = await Promise.all([
      db.select({ id: schema.users.id }).from(schema.users).limit(1),
      db.select().from(schema.services).where(eq(schema.services.active, true)),
      db.select().from(schema.settings),
    ]);
    const settings = new Map(settingsRows.map((row) => [row.key, row.value]));
    return {
      has_owner: userRows.length > 0,
      services: serviceRows.map(serviceRow),
      jazzcash: { configured: Boolean(settings.get("jazzcash_number")), account_name: settings.get("jazzcash_name") ?? "", account_number: settings.get("jazzcash_number") ?? "" },
    };
  }),

  signup: withValidation(
    z.object({ name: z.string().trim().min(2).max(80), email: z.string().email().max(180), password: z.string().min(8).max(128) }),
    async (args) => {
      const email = args.email.trim().toLowerCase();
      const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (existing.length > 0) return { ok: false, message: "An account already exists for this email." };
      const anyUser = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
      // Standalone port: on a fresh deploy the first signup becomes the admin (owner).
      const role = anyUser.length === 0 ? "admin" : "customer";
      const inserted = await db.insert(schema.users).values({ name: args.name.trim(), email, passwordHash: await hashPassword(args.password), role }).returning({ id: schema.users.id });
      const user = inserted[0];
      if (!user) return { ok: false, message: "Account could not be created." };
      const token = await createSession(user.id);
      return { ok: true, message: role === "admin" ? "Owner account created." : "Account created.", token, role };
    }
  ),

  login: withValidation(
    z.object({ email: z.string().email(), password: z.string().min(1).max(128) }),
    async (args) => {
      const rows = await db.select().from(schema.users).where(eq(schema.users.email, args.email.trim().toLowerCase())).limit(1);
      const user = rows[0];
      if (!user || !(await verifyPassword(args.password, user.passwordHash))) return { ok: false, message: "Email or password is incorrect." };
      return { ok: true, message: "Signed in.", token: await createSession(user.id), role: user.role };
    }
  ),

  resetOwnerPassword: withValidation(
    z.object({ email: z.string().email().max(180), new_password: z.string().min(8).max(128), recovery_secret: z.string().min(1).max(200) }),
    async (args) => {
      const secret = process.env.RECOVERY_SECRET;
      if (!secret) return { ok: false, message: "Password recovery is not configured on this server." };
      if (args.recovery_secret !== secret) return { ok: false, message: "Recovery secret is incorrect." };
      const rows = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.email, args.email.trim().toLowerCase()), eq(schema.users.role, "admin"))).limit(1);
      const owner = rows[0];
      if (!owner) return { ok: false, message: "That email does not match the owner account." };
      await db.batch([
        db.update(schema.users).set({ passwordHash: await hashPassword(args.new_password) }).where(eq(schema.users.id, owner.id)),
        db.delete(schema.sessions).where(eq(schema.sessions.userId, owner.id)),
      ]);
      return { ok: true, message: "Owner password reset. You can sign in with the new password now." };
    }
  ),

  logout: withValidation(
    z.object({ token: z.string().min(1) }),
    async (args) => {
      await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, await sha256(args.token)));
      return { ok: true };
    }
  ),

  getDashboard: withValidation(
    z.object({ token: z.string().min(1) }),
    async (args) => {
      const user = await authUser(args.token);
      if (!user) return { ok: false, message: "Your session has expired. Please sign in again." };
      const serviceRows = await db.select().from(schema.services).where(eq(schema.services.active, true));
      const orderRows = await db.select({ order: schema.orders, service: schema.services, customer: schema.users.name }).from(schema.orders).innerJoin(schema.services, eq(schema.orders.serviceId, schema.services.id)).innerJoin(schema.users, eq(schema.orders.userId, schema.users.id)).where(user.role === "admin" ? gte(schema.orders.id, 0) : eq(schema.orders.userId, user.id)).orderBy(desc(schema.orders.id)).limit(100);
      const fundRows = await db.select({ fund: schema.fundRequests, customer: schema.users.name }).from(schema.fundRequests).innerJoin(schema.users, eq(schema.fundRequests.userId, schema.users.id)).where(user.role === "admin" ? gte(schema.fundRequests.id, 0) : eq(schema.fundRequests.userId, user.id)).orderBy(desc(schema.fundRequests.id)).limit(100);
      const ledgerRows = await db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.userId, user.id)).orderBy(desc(schema.ledgerEntries.id)).limit(30);
      const settingsRows = await db.select().from(schema.settings);
      const settings = new Map(settingsRows.map((row) => [row.key, row.value]));
      const totals = orderRows.reduce((acc, row) => ({ revenue_pkr: acc.revenue_pkr + row.order.chargedPaisa / 100, provider_cost_pkr: acc.provider_cost_pkr + row.order.providerCostPaisa / 100, profit_pkr: acc.profit_pkr + row.order.profitPaisa / 100, pending_funds: acc.pending_funds }), { revenue_pkr: 0, provider_cost_pkr: 0, profit_pkr: 0, pending_funds: fundRows.filter((r) => r.fund.status === "pending").length });
      return {
        ok: true, message: "Dashboard loaded.", me: { id: user.id, name: user.name, email: user.email, role: user.role, balance_pkr: user.balancePaisa / 100 },
        services: serviceRows.map(serviceRow),
        orders: orderRows.map(({ order, service, customer }) => ({ id: order.id, customer, service: service.name, platform: service.platform, link: order.link, quantity: order.quantity, charge_pkr: order.chargedPaisa / 100, provider_cost_pkr: order.providerCostPaisa / 100, profit_pkr: order.profitPaisa / 100, status: order.status, provider_order_id: order.providerOrderId, remains: order.remains, error: order.errorMessage, created_at: order.createdAt.toISOString(), last_synced_at: order.lastSyncedAt?.toISOString() ?? null })),
        funds: fundRows.map(({ fund, customer }) => ({ id: fund.id, customer, amount_pkr: fund.amountPaisa / 100, tid: fund.tid, status: fund.status, note: fund.note, created_at: fund.createdAt.toISOString(), reviewed_at: fund.reviewedAt?.toISOString() ?? null })),
        ledger: ledgerRows.map((row) => ({ id: row.id, type: row.type, amount_pkr: row.amountPaisa / 100, note: row.note, created_at: row.createdAt.toISOString() })),
        provider: { connected: Boolean(settings.get(PROVIDER_KEY_SETTING)), connected_at: settings.get(PROVIDER_CONNECTED_AT_SETTING) ?? null }, totals,
        jazzcash: { account_name: settings.get("jazzcash_name") ?? "", account_number: settings.get("jazzcash_number") ?? "" },
      };
    }
  ),

  submitFundRequest: withValidation(
    z.object({ token: z.string().min(1), amount_pkr: z.number().finite().min(100).max(1000000), tid: z.string().trim().min(4).max(80) }),
    async (args) => {
      const user = await authUser(args.token);
      if (!user) return { ok: false, message: "Please sign in again." };
      const settings = await db.select().from(schema.settings).where(eq(schema.settings.key, "jazzcash_number")).limit(1);
      if (!settings[0]?.value) return { ok: false, message: "JazzCash details are not configured yet. Contact the owner." };
      try {
        await db.insert(schema.fundRequests).values({ userId: user.id, amountPaisa: Math.round(args.amount_pkr * 100), tid: args.tid.trim() });
      } catch {
        return { ok: false, message: "This transaction ID is already in use." };
      }
      return { ok: true, message: "Payment proof submitted for owner approval." };
    }
  ),

  reviewFundRequest: withValidation(
    z.object({ token: z.string().min(1), request_id: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(240).optional() }),
    async (args) => {
      const admin = await requireAdmin(args.token);
      if (!admin) return { ok: false, message: "Owner access required." };
      const rows = await db.select().from(schema.fundRequests).where(eq(schema.fundRequests.id, args.request_id)).limit(1);
      const request = rows[0];
      if (!request || request.status !== "pending") return { ok: false, message: "This request is no longer pending." };
      const now = new Date();
      await db.update(schema.fundRequests).set({ status: args.decision, note: args.note ?? null, reviewedBy: admin.id, reviewedAt: now }).where(and(eq(schema.fundRequests.id, request.id), eq(schema.fundRequests.status, "pending")));
      if (args.decision === "approved") {
        await db.batch([
          db.update(schema.users).set({ balancePaisa: sql`${schema.users.balancePaisa} + ${request.amountPaisa}` }).where(eq(schema.users.id, request.userId)),
          db.insert(schema.ledgerEntries).values({ userId: request.userId, type: "fund_credit", amountPaisa: request.amountPaisa, referenceType: "fund_request", referenceId: request.id, note: `JazzCash TID ${request.tid} approved` }),
        ]);
      }
      return { ok: true, message: args.decision === "approved" ? "Funds approved and balance credited." : "Fund request rejected." };
    }
  ),

  configureJazzCash: withValidation(
    z.object({ token: z.string().min(1), account_name: z.string().trim().min(2).max(100), account_number: z.string().trim().regex(/^\+?[0-9]{10,15}$/) }),
    async (args) => {
      if (!(await requireAdmin(args.token))) return { ok: false, message: "Owner access required." };
      const now = new Date();
      for (const [key, value] of [["jazzcash_name", args.account_name.trim()], ["jazzcash_number", args.account_number.trim()]]) {
        await db.insert(schema.settings).values({ key, value, updatedAt: now }).onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: now } });
      }
      return { ok: true, message: "JazzCash payment details saved." };
    }
  ),

  provisionProvider: withValidation(
    z.object({ api_key: z.string().trim().min(20).max(200) }),
    async (args) => {
      const existingKey = await getProviderKey();
      if (existingKey) return { ok: true, message: "Provider is already configured." };
      await saveProviderCredential(args.api_key.trim());
      return { ok: true, message: "Provider credential stored server-side." };
    }
  ),

  connectProvider: withValidation(
    z.object({ token: z.string().min(1), api_key: z.string().trim().min(20).max(200) }),
    async (args) => {
      if (!(await requireAdmin(args.token))) return { ok: false, message: "Owner access required." };
      const result = await providerRequest({ action: "balance" }, args.api_key.trim());
      if (!result.ok) return { ok: false, message: result.error };
      await saveProviderCredential(args.api_key.trim());
      const balance = typeof result.data.balance === "string" || typeof result.data.balance === "number" ? String(result.data.balance) : undefined;
      return { ok: true, message: "Provider connected and saved on the server.", ...(balance ? { balance } : {}) };
    }
  ),

  refreshProviderCatalog: withValidation(z.object({}), async () => syncAllProviderServices()),

  syncProviderServices: withValidation(
    z.object({ token: z.string().min(1) }),
    async (args) => {
      if (!(await requireAdmin(args.token))) return { ok: false, message: "Owner access required." };
      return syncAllProviderServices();
    }
  ),

  disconnectProvider: withValidation(
    z.object({ token: z.string().min(1) }),
    async (args) => {
      if (!(await requireAdmin(args.token))) return { ok: false, message: "Owner access required." };
      await db.batch([
        db.delete(schema.settings).where(eq(schema.settings.key, PROVIDER_KEY_SETTING)),
        db.delete(schema.settings).where(eq(schema.settings.key, PROVIDER_CONNECTED_AT_SETTING)),
      ]);
      return { ok: true, message: "Provider disconnected." };
    }
  ),

  createOrder: withValidation(
    z.object({ token: z.string().min(1), service_id: z.number().int().positive(), link: z.string().url().max(2000), quantity: z.number().int().positive() }),
    async (args) => {
      const user = await authUser(args.token);
      if (!user) return { ok: false, message: "Please sign in again." };
      if (!(await getProviderKey())) return { ok: false, message: "Ordering is temporarily paused while the owner reconnects the provider." };
      const serviceRows = await db.select().from(schema.services).where(and(eq(schema.services.id, args.service_id), eq(schema.services.active, true))).limit(1);
      const service = serviceRows[0];
      if (!service) return { ok: false, message: "Service is unavailable." };
      if (args.quantity < service.minQuantity || args.quantity > service.maxQuantity) return { ok: false, message: `Quantity must be between ${service.minQuantity.toLocaleString()} and ${service.maxQuantity.toLocaleString()}.` };
      const chargedPaisa = Math.round((service.pricePkr * args.quantity * 100) / 1000);
      const providerCostPaisa = Math.round((service.providerRateUsd * USD_TO_PKR * args.quantity * 100) / 1000);
      const profitPaisa = chargedPaisa - providerCostPaisa;
      const freshUser = await db.select({ balance: schema.users.balancePaisa }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
      if ((freshUser[0]?.balance ?? 0) < chargedPaisa) return { ok: false, message: `Insufficient balance. This order costs Rs. ${(chargedPaisa / 100).toFixed(2)}.` };
      const debited = await db.update(schema.users).set({ balancePaisa: sql`${schema.users.balancePaisa} - ${chargedPaisa}` }).where(and(eq(schema.users.id, user.id), gte(schema.users.balancePaisa, chargedPaisa))).returning({ balance: schema.users.balancePaisa });
      if (!debited[0]) return { ok: false, message: "Balance changed before checkout. Please try again." };
      const inserted = await db.insert(schema.orders).values({ userId: user.id, serviceId: service.id, link: args.link, quantity: args.quantity, chargedPaisa, providerCostPaisa, profitPaisa, status: "submitting" }).returning({ id: schema.orders.id });
      const order = inserted[0];
      if (!order) {
        await db.update(schema.users).set({ balancePaisa: sql`${schema.users.balancePaisa} + ${chargedPaisa}` }).where(eq(schema.users.id, user.id));
        return { ok: false, message: "Order could not be prepared. Your balance was restored." };
      }
      await db.insert(schema.ledgerEntries).values({ userId: user.id, type: "order_debit", amountPaisa: -chargedPaisa, referenceType: "order", referenceId: order.id, note: `${service.platform} ${service.name}` });
      const provider = await providerRequest({ action: "add", service: service.providerServiceId, link: args.link, quantity: String(args.quantity) });
      if (!provider.ok || (typeof provider.data.order !== "number" && typeof provider.data.order !== "string")) {
        await db.batch([
          db.update(schema.orders).set({ status: "failed", errorMessage: provider.ok ? "Provider did not return an order ID." : provider.error, updatedAt: new Date() }).where(eq(schema.orders.id, order.id)),
          db.update(schema.users).set({ balancePaisa: sql`${schema.users.balancePaisa} + ${chargedPaisa}` }).where(eq(schema.users.id, user.id)),
          db.insert(schema.ledgerEntries).values({ userId: user.id, type: "order_refund", amountPaisa: chargedPaisa, referenceType: "order", referenceId: order.id, note: "Automatic refund: provider submission failed" }),
        ]);
        return { ok: false, message: "Provider submission failed. Your balance was restored.", order_id: order.id };
      }
      await db.update(schema.orders).set({ providerOrderId: String(provider.data.order), status: "pending", providerStatus: "Pending", lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
      return { ok: true, message: "Order submitted to the provider.", order_id: order.id };
    }
  ),

  syncOrder: withValidation(
    z.object({ token: z.string().min(1), order_id: z.number().int().positive() }),
    async (args) => {
      const user = await authUser(args.token);
      if (!user) return { ok: false, message: "Please sign in again." };
      const rows = await db.select().from(schema.orders).where(and(eq(schema.orders.id, args.order_id), user.role === "admin" ? gte(schema.orders.id, 0) : eq(schema.orders.userId, user.id))).limit(1);
      const order = rows[0];
      if (!order?.providerOrderId) return { ok: false, message: "This order has no provider reference." };
      const result = await providerRequest({ action: "status", order: order.providerOrderId });
      if (!result.ok) return { ok: false, message: result.error };
      const providerStatus = typeof result.data.status === "string" ? result.data.status : "Unknown";
      const normalized = providerStatus.toLowerCase().replace(/\s+/g, "_");
      const status =
        normalized.includes("complete") ? "completed" : normalized.includes("progress") || normalized.includes("process") ? "in_progress" : normalized.includes("partial") ? "partial" : normalized.includes("cancel") ? "canceled" : normalized.includes("fail") ? "failed" : "pending";
      const remainsValue = typeof result.data.remains === "number" ? result.data.remains : typeof result.data.remains === "string" ? Number(result.data.remains) : null;
      const remains = remainsValue !== null && Number.isFinite(remainsValue) ? remainsValue : null;
      await db.update(schema.orders).set({ status, providerStatus, remains, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
      return { ok: true, message: "Order status refreshed.", status };
    }
  ),
};
