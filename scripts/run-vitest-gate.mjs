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

    let output = "";
    let workerLossDetected = false;
    let workerLossScanTail = "";
    /** @param {Buffer | string} chunk */
    const retainOutput = (chunk) => {
      const text = chunk.toString();
      const scanText = `${workerLossScanTail}${text}`;
      workerLossDetected ||= containsWorkerLoss(scanText);
      workerLossScanTail = scanText.slice(-WORKER_LOSS_SCAN_TAIL);
      output = `${output}${text}`.slice(-OUTPUT_TAIL_LIMIT);
    };

    child.stdout.on("data", (chunk) => {
      writeStdout(chunk);
      retainOutput(chunk);
    });
    child.stderr.on("data", (chunk) => {
      writeStderr(chunk);
      retainOutput(chunk);
    });
    child.once("error", rejectRun);
    // `exit` can fire before stdout/stderr have flushed the final summary.
    // Wait for `close` so the parser sees the complete reporter output.
    child.once("close", (code, signal) =>
      resolveRun({ code, signal, output, workerLossDetected })
    );
  });
}

/**
 * Apply the canonical summary, worker-loss, and child-exit checks to one run.
 * This exported seam keeps the package-level gate testable without spawning a
 * real Vitest process.
 *
 * @param {{ run?: () => Promise<{ code: number | null, signal: string | null, output: string, workerLossDetected?: boolean }>, expected?: { testFiles: number, tests: number } | null }} options
 */
export async function runVitestGate({ run = runVitest, expected = null } = {}) {
  const expectedManifest =
    expected ?? JSON.parse(await readFile(countPath, "utf8"));
  const result = await run();
  const summary = parseVitestSummary(result.output);
  const gate = assertVitestGate({
    summary,
    output: result.output,
    expected: expectedManifest,
    workerLossDetected: result.workerLossDetected
  });

  if (result.code !== 0 || result.signal) {
    throw new Error(
      `Vitest exited with ${result.signal ? `signal ${result.signal}` : `code ${result.code}`}.`
    );
  }

  return gate;
}

async function main() {
  assertCanonicalGateArgs(process.argv.slice(2));
  const gate = await runVitestGate();
  console.log(
    `Vitest gate passed: ${gate.passed} passed, ${gate.skipped} skipped across ${gate.testFiles} files (${gate.tests} total).`
  );
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
