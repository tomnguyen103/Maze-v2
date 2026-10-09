import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertCanonicalGateArgs,
  assertVitestGate,
  containsWorkerLoss,
  parseVitestSummary
} from "./vitest-gate.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const countPath = join(root, "scripts", "vitest-test-count.json");
const vitestPath = join(root, "node_modules", "vitest", "vitest.mjs");
const OUTPUT_TAIL_LIMIT = 1024 * 1024;
const WORKER_LOSS_SCAN_TAIL = 128;
/**
 * Windows STATUS_STACK_BUFFER_OVERRUN (0xC0000409), the native Vitest crash.
 * Workaround: the evidence points to Node 24.15.0's `fetch` on Windows, so the
 * gate retries this code. The removal rule (2 conditions) is in
 * docs/solutions/testing/gate-summary-parsed-from-merged-streams.md.
 */
export const NATIVE_CRASH_EXIT_CODE = 3221226505;
const MAX_ATTEMPTS = 3;

/**
 * @typedef {Object} ChildProcessLike
 * @property {{ on: (event: string, listener: (chunk: Buffer) => void) => void }} stdout
 * @property {{ on: (event: string, listener: (chunk: Buffer) => void) => void }} stderr
 * @property {(event: string, listener: (...args: any[]) => void) => void} once
 */

/** @typedef {(executable: string, args: string[], options: object) => ChildProcessLike} SpawnProcess */

/**
 * Run the canonical full Vitest suite and retain enough adjacent output to
 * detect worker-loss markers split across child-process data events.
 *
 * @param {{
 *   spawnProcess?: SpawnProcess,
 *   executable?: string,
 *   vitestExecutable?: string,
 *   rootDirectory?: string,
 *   writeStdout?: (chunk: Buffer) => void,
 *   writeStderr?: (chunk: Buffer) => void
 * }} options
 * @returns {Promise<{
 *   code: number | null,
 *   signal: string | null,
 *   output: string,
 *   stderr: string,
 *   workerLossDetected: boolean
 * }>} `output` is stdout alone — the stream the summary is parsed from.
 */
export function runVitest({
  spawnProcess = spawn,
  executable = process.execPath,
  vitestExecutable = vitestPath,
  rootDirectory = root,
  writeStdout = (chunk) => process.stdout.write(chunk),
  writeStderr = (chunk) => process.stderr.write(chunk)
} = {}) {
  return new Promise((resolveRun, rejectRun) => {
    /** @type {NodeJS.ProcessEnv} */
    const childEnv = { ...process.env, FORCE_COLOR: "0" };
    delete childEnv.NO_COLOR;
    const child = spawnProcess(
      executable,
      [vitestExecutable, "run", "--reporter=dot", "--no-color"],
      {
        cwd: rootDirectory,
        env: childEnv,
        stdio: ["inherit", "pipe", "pipe"]
      }
    );

    // Two buffers, not one. The summary the gate parses is written to
    // stdout, but a test that logs to stderr interleaves into the same
    // stream at arbitrary byte offsets — including in the middle of the
    // summary line. Merging them reproduced a gate failure on green code.
    let stdout = "";
    let stderr = "";
    let workerLossDetected = false;
    /** One scan tail per stream: splicing them would fabricate matches. */
    const scanTails = { stdout: "", stderr: "" };
    /**
     * @param {"stdout" | "stderr"} stream
     * @param {string} text
     */
    const scanForWorkerLoss = (stream, text) => {
      const scanText = `${scanTails[stream]}${text}`;
      workerLossDetected ||= containsWorkerLoss(scanText);
      scanTails[stream] = scanText.slice(-WORKER_LOSS_SCAN_TAIL);
    };

    child.stdout.on("data", (chunk) => {
      writeStdout(chunk);
      const text = chunk.toString();
      scanForWorkerLoss("stdout", text);
      stdout = `${stdout}${text}`.slice(-OUTPUT_TAIL_LIMIT);
    });
    child.stderr.on("data", (chunk) => {
      writeStderr(chunk);
      const text = chunk.toString();
      scanForWorkerLoss("stderr", text);
      stderr = `${stderr}${text}`.slice(-OUTPUT_TAIL_LIMIT);
    });
    child.once("error", rejectRun);
    // `exit` can fire before stdout/stderr have flushed the final summary.
    // Wait for `close` so the parser sees the complete reporter output.
    child.once("close", (code, signal) =>
      resolveRun({ code, signal, output: stdout, stderr, workerLossDetected })
    );
  });
}

/**
 * Apply the canonical summary, worker-loss, and child-exit checks to one run.
 * This exported seam keeps the package-level gate testable without spawning a
 * real Vitest process.
 *
 * The gate retries a run that exits with the native crash code before it prints
 * a summary, up to `MAX_ATTEMPTS` runs in total. Any other failure is final.
 *
 * @param {{ run?: () => Promise<{ code: number | null, signal: string | null, output: string, stderr?: string, workerLossDetected?: boolean }>, expected?: { testFiles: number, tests: number, skipped?: number | null } | null, logRetry?: (message: string) => void }} options
 */
export async function runVitestGate({
  run = runVitest,
  expected = null,
  logRetry = (message) => console.error(message)
} = {}) {
  const expectedManifest =
    expected ?? JSON.parse(await readFile(countPath, "utf8"));

  for (let attempt = 1; ; attempt += 1) {
    const result = await run();
    const exitDescription = result.signal
      ? `signal ${result.signal}`
      : `code ${result.code}`;
    const exited = result.code !== 0 || result.signal;

    /** @type {import("./vitest-gate.mjs").VitestSummary} */
    let summary;
    try {
      summary = parseVitestSummary(result.output);
    } catch (error) {
      // A child that died before printing its summary used to be reported as
      // "did not emit a complete test summary", which names the symptom and
      // hides the cause.
      if (!exited) throw error;
      // Node reports a signal kill as code null, so this also rejects signals.
      if (
        result.code !== NATIVE_CRASH_EXIT_CODE ||
        result.workerLossDetected
      ) {
        throw new Error(
          `Vitest exited with ${exitDescription} before emitting a summary.`,
          { cause: error }
        );
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(
          `Vitest exited with ${exitDescription} before emitting a summary on all ${MAX_ATTEMPTS} attempts.`,
          { cause: error }
        );
      }
      logRetry(
        `Vitest crashed natively (${exitDescription}, 0x${NATIVE_CRASH_EXIT_CODE.toString(16).toUpperCase()}) before emitting a summary; retrying, attempt ${attempt + 1} of ${MAX_ATTEMPTS}.`
      );
      continue;
    }
    const gate = assertVitestGate({
      summary,
      output: result.output,
      stderr: result.stderr,
      expected: expectedManifest,
      workerLossDetected: result.workerLossDetected
    });

    if (exited) {
      throw new Error(`Vitest exited with ${exitDescription}.`);
    }

    return { ...gate, retries: attempt - 1 };
  }
}

/**
 * The manifest pins `skipped` for the default configuration, where the
 * database and object-store lanes are dark. An operator who arms those lanes
 * executes tests the manifest counts as skipped, and must not be punished for
 * it — but the pin has to stay exact in the configuration the gate normally
 * runs in, which is the whole point of pinning it.
 */
async function expectedForEnv() {
  const manifest = JSON.parse(await readFile(countPath, "utf8"));
  const integrationArmed =
    process.env.RUN_DATABASE_INTEGRATION === "1" ||
    process.env.RUN_AUDIT_SINK_INTEGRATION === "1";
  if (!integrationArmed) return manifest;
  console.log(
    `Integration lanes are armed, so up to ${manifest.skipped} skipped tests are expected rather than exactly that many.`
  );
  return { ...manifest, maxSkipped: manifest.skipped, skipped: null };
}

/**
 * @param {{ passed: number, skipped: number, testFiles: number, tests: number, retries: number }} gate
 */
export function gatePassLine(gate) {
  const retried =
    gate.retries > 0
      ? ` after ${gate.retries} native-crash ${gate.retries === 1 ? "retry" : "retries"}`
      : "";
  return `Vitest gate passed${retried}: ${gate.passed} passed, ${gate.skipped} skipped across ${gate.testFiles} files (${gate.tests} total).`;
}

async function main() {
  assertCanonicalGateArgs(process.argv.slice(2));
  const gate = await runVitestGate({ expected: await expectedForEnv() });
  console.log(gatePassLine(gate));
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(`Vitest gate failed: ${error.message}`);
    process.exitCode = 1;
  });
}
