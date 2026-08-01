import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCanonicalGateArgs,
  assertVitestGate,
  containsWorkerLoss,
  parseVitestSummary
} from "./vitest-gate.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const countPath = join(root, "scripts", "vitest-test-count.json");
const vitestPath = join(root, "node_modules", "vitest", "vitest.mjs");
function runVitest() {
  return new Promise((resolveRun, rejectRun) => {
    const childEnv = { ...process.env, FORCE_COLOR: "0" };
    delete childEnv.NO_COLOR;
    const child = spawn(
      process.execPath,
      [vitestPath, "run", "--reporter=dot", "--no-color"],
      {
        cwd: root,
        env: childEnv,
        stdio: ["inherit", "pipe", "pipe"]
      }
    );

    let output = "";
    let workerLossDetected = false;
    const retainOutput = (chunk) => {
      const text = chunk.toString();
      workerLossDetected ||= containsWorkerLoss(text);
      output = `${output}${text}`.slice(-1024 * 1024);
    };

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      retainOutput(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
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

try {
  assertCanonicalGateArgs(process.argv.slice(2));
  const expected = JSON.parse(await readFile(countPath, "utf8"));
  const result = await runVitest();
  const summary = parseVitestSummary(result.output);
  const gate = assertVitestGate({
    summary,
    output: result.output,
    expected,
    workerLossDetected: result.workerLossDetected
  });

  if (result.code !== 0 || result.signal) {
    throw new Error(
      `Vitest exited with ${result.signal ? `signal ${result.signal}` : `code ${result.code}`}.`
    );
  }

  console.log(
    `Vitest gate passed: ${gate.passed} passed, ${gate.skipped} skipped across ${gate.testFiles} files (${gate.tests} total).`
  );
} catch (error) {
  console.error(`Vitest gate failed: ${error.message}`);
  process.exitCode = 1;
}
