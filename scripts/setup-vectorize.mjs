#!/usr/bin/env node
/**
 * One-time setup: create the Vectorize index and KV namespace, then print the
 * IDs you need to paste into wrangler.jsonc.
 *
 * Usage:
 *   npm run setup:vectorize
 *
 * Requires: `wrangler login` to have been run (Cloudflare auth).
 */
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.info("→ Creating Vectorize index 'clarity-memory' (dimensions=768, metric=cosine)…");
run("npx", [
  "wrangler",
  "vectorize",
  "create",
  "clarity-memory",
  "--dimensions=768",
  "--metric=cosine",
]);

console.info("\n→ Creating KV namespace 'clarity-prefs' (capture the id printed below)…");
run("npx", ["wrangler", "kv", "namespace", "create", "clarity-prefs"]);

console.info(
  "\n✔ Setup complete. Paste the KV namespace id printed above into wrangler.jsonc → kv_namespaces[0].id.",
);
