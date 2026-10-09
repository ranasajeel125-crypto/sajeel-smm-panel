// Standalone SMM panel server (Node 20+).
// - POST /api/<actionName>  -> runs the matching action from actions.mjs
// - GET  /api/health        -> liveness check (used by Render)
// - Serves the built Vite client from ../client/dist for everything else.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Actions } from "./actions.mjs";
import { initDb } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "smm-panel" });
});

app.post("/api/:action", async (req, res) => {
  const name = req.params.action;
  const handler = Actions[name];
  if (typeof handler !== "function") {
    return res.status(404).json({ ok: false, message: "Unknown action." });
  }
  try {
    const result = await handler(req.body ?? {});
    res.json(result ?? { ok: false, message: "Empty response." });
  } catch (err) {
    console.error(`[api] action "${name}" threw:`, err && err.message ? err.message : err);
    res.status(500).json({ ok: false, message: "Something went wrong. Please try again." });
  }
});

const clientDir = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDir, { maxAge: "1h", index: false }));
// SPA fallback: every non-API route serves the client.
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

async function main() {
  await initDb();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("[server] failed to start:", err && err.message ? err.message : err);
  process.exit(1);
});
