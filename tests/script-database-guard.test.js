import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A malformed DATABASE_URL must land in each script's documented "could not
// run" exit code (2), not escape as an uncaught throw (exit 1). The pool is
// therefore constructed inside the error handler, matching
// scripts/prune-webhook-inbox.mjs and scripts/list-dead-webhooks.mjs.
const SCRIPTS = [
  { path: "scripts/verify-audit-chain.mjs", args: [] },
  { path: "scripts/prune-rate-limits.mjs", args: [] },
  { path: "scripts/grant-admin.mjs", args: ["user_guard_test"] }
];

/**
 * @param {string} script
 * @param {string[]} args
 * @returns {Promise<{ code: number, stderr: string }>}
 */
function runScript(script, args) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [script, ...args],
      { env: { ...process.env, DATABASE_URL: "not a connection string" } },
      (error, _stdout, stderr) => {
        resolve({
          code:
            error && typeof error.code === "number" ? error.code : error ? 1 : 0,
          stderr
        });
      }
    );
  });
}

describe("operational script database guards", () => {
  for (const script of SCRIPTS) {
    it(`${script.path} exits 2 on a malformed DATABASE_URL`, async () => {
      const { code, stderr } = await runScript(script.path, script.args);
      expect(code).toBe(2);
      expect(stderr).toContain("ERROR");
      expect(stderr).not.toContain("at new URL");
    });

    it(`${script.path} bounds connection and query time`, () => {
      const source = readFileSync(script.path, "utf8");
      expect(source).toContain("connectionTimeoutMillis");
      expect(source).toContain("query_timeout");
    });
  }
});
