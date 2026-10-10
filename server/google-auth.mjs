// Google OAuth for SMM panel - "Continue with Google"
// Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Redirect URI must be: https://<your-domain>/api/auth/google/callback
import { eq } from "drizzle-orm";
import { db } from "./db.mjs";
import * as schema from "./schema.mjs";

const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return bytesToHex(new Uint8Array(digest));
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

function getRedirectUri(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}/api/auth/google/callback`;
}

export function googleAuthUrl(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function handleGoogleCallback(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, message: "Google login is not configured on this server." };
  }
  const code = req.query.code;
  if (!code) return { ok: false, message: "Google login was cancelled." };

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: String(code),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(req),
      grant_type: "authorization_code",
    }).toString(),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return { ok: false, message: "Google login failed. Please try again." };
  }

  // Get user info
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await userRes.json();
  if (!profile.email) {
    return { ok: false, message: "Could not get email from Google." };
  }

  const email = String(profile.email).toLowerCase().trim();
  const name = String(profile.name || email.split("@")[0]).trim().slice(0, 80);

  // Find or create user
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  let userId;
  if (existing.length > 0) {
    userId = existing[0].id;
  } else {
    const anyUser = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    const role = anyUser.length === 0 ? "admin" : "customer";
    // Google users get a random unusable password hash
    const randomHash = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    const inserted = await db.insert(schema.users).values({ name, email, passwordHash: `google:${randomHash}`, role }).returning({ id: schema.users.id });
    if (!inserted[0]) return { ok: false, message: "Account could not be created." };
    userId = inserted[0].id;
  }

  const token = await createSession(userId);
  return { ok: true, token };
}
