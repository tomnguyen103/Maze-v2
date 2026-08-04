import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseVitestSummary } from "./vitest-gate.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitestPath = join(root, "node_modules", "vitest", "vitest.mjs");

/**
 * The database and object-store lanes are `describe.runIf(...)`, so with the
 * environment absent they report as skipped and the suite still exits 0. That
 * is how the repo's strongest security assertion — forced-RLS cross-tenant
 * denial — executed nowhere while every gate run reported green.
 *
 * This runner refuses to start without the environment those lanes need, and
 * fails if a lane it was asked to run reports zero executed tests. It is not
 * part of `npm run check`: the gate must stay runnable with no database.
 */
export const DATABASE_LANE_ENV = Object.freeze({
  RUN_DATABASE_INTEGRATION: "Set to `1` to arm the PostgreSQL lanes.",
  DATABASE_URL:
    "Runtime role connection string — the least-privileged role the app uses. The forced-RLS assertions are meaningless if this is a superuser.",
  DATABASE_ADMIN_URL:
    "Migration/owner role connection string, used to seed and tear down fixtures."
});

export const AUDIT_SINK_LANE_ENV = Object.freeze({
  RUN_AUDIT_SINK_INTEGRATION: "Set to `1` to arm the object-store lane.",
  AUDIT_CHECKPOINT_TEST_BUCKET:
    "A bucket the audit-checkpoint sink may write throwaway objects to.",
  AUDIT_CHECKPOINT_BUCKET: "The production-prefix bucket the sink reads back.",
  AUDIT_CHECKPOINT_REGION: "Region for both buckets.",
  AUDIT_CHECKPOINT_ACCESS_KEY_ID: "Credential for the test object store.",
  AUDIT_CHECKPOINT_SECRET_ACCESS_KEY: "Credential for the test object store.",
  AUDIT_CHECKPOINT_HMAC_KEY: "Checkpoint signing key."
});

/** The lane files each environment set unlocks. */
const DATABASE_LANE_PATTERN = "tests/*.integration.test.js";
const AUDIT_SINK_LANE_PATTERN =
  "tests/audit-checkpoint-s3.integration.test.js";

/**
 * @param {Record<string, string | undefined>} env
 * @param {Readonly<Record<string, string>>} required
 * @returns {string[]} the names that are missing or empty
 */
export function missingEnv(env, required) {
  return Object.keys(required).filter((name) => !env[name]);
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ patterns: string[], problems: string[] }}
 */
export function planDatabaseLane(env) {
  /** @type {string[]} */
  const patterns = [];
  /** @type {string[]} */
  const problems = [];

  const databaseGaps = missingEnv(env, DATABASE_LANE_ENV);
  if (databaseGaps.length === 0) {
    // The database glob already covers every integration file, including the
    // object-store one, which self-skips unless its own flag is armed.
    patterns.push(DATABASE_LANE_PATTERN);
  } else if (databaseGaps.length < Object.keys(DATABASE_LANE_ENV).length) {
    problems.push(
      `The PostgreSQL lanes are partly configured. Missing: ${databaseGaps.join(", ")}.`
    );
  }

  const sinkGaps = missingEnv(env, AUDIT_SINK_LANE_ENV);
  if (sinkGaps.length === 0) {
    if (!patterns.includes(DATABASE_LANE_PATTERN)) {
      patterns.push(AUDIT_SINK_LANE_PATTERN);
    }
  } else if (sinkGaps.length < Object.keys(AUDIT_SINK_LANE_ENV).length) {
    problems.push(
      `The object-store lane is partly configured. Missing: ${sinkGaps.join(", ")}.`
    );
  }

  if (patterns.length === 0 && problems.length === 0) {
    problems.push(
      `Nothing to run. Set ${Object.keys(DATABASE_LANE_ENV).join(", ")} for the PostgreSQL lanes, or ${Object.keys(AUDIT_SINK_LANE_ENV).join(", ")} for the object-store lane. See docs/testing-database-lane.md.`
    );
  }

  return { patterns, problems };
}

/**
 * A lane that reports every one of its tests as skipped ran nothing, which is
 * the exact failure this runner exists to make visible.
 *
 * @param {string} output
 */
export function assertLaneExecuted(output) {
  /** @type {import("./vitest-gate.mjs").VitestSummary} */
  let summary;
  try {
    summary = parseVitestSummary(output);
  } catch {
    throw new Error("Vitest did not emit a test summary.");
  }
  if (summary.passed === 0) {
    throw new Error(
      `No test in the database lane executed. Vitest reported ${summary.passed} passed, ${summary.skipped} skipped of ${summary.tests}.`
    );
  }
  return { passed: summary.passed };
}

async function main() {
  const { patterns, problems } = planDatabaseLane(process.env);
  for (const problem of problems) console.error(problem);
  if (patterns.length === 0) {
    process.exitCode = 1;
    return;
  }

  const output = await new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [vitestPath, "run", "--reporter=dot", "--no-color", ...patterns],
      { cwd: root, stdio: ["inherit", "pipe", "pipe"] }
    );
    let text = "";
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      text += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
    child.once("error", rejectRun);
    child.once("close", (code) => {
      if (code !== 0) {
        rejectRun(new Error(`Vitest exited with code ${code}.`));
        return;
      }
      resolveRun(text);
    });
  });

  const { passed } = assertLaneExecuted(output);
  console.log(`Database lane passed: ${passed} tests executed against a live database.`);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(`Database lane failed: ${error.message}`);
    process.exitCode = 1;
  });
}
