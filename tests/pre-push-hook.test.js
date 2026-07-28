import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const hook = readFileSync(".githooks/pre-push", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

/** The steps `npm run check` chains, in order. */
function checkSteps() {
  return packageJson.scripts.check
    .split("&&")
    .map((/** @type {string} */ part) => part.trim().replace(/^npm run /, ""));
}

/** The steps the hook loops over, in order. */
function hookSteps() {
  const declared = hook.match(/^STEPS="([^"]+)"$/m);
  return declared ? declared[1].trim().split(/\s+/) : [];
}

/**
 * Runs the hook against a stub `npm` that fails on one named step, so the
 * assertion is about the hook's reporting rather than about a real gate.
 *
 * @param {string | null} failingStep
 * @param {number} [failureStatus]
 */
function runHookWithStubbedNpm(failingStep, failureStatus = 1) {
  const directory = mkdtempSync(join(tmpdir(), "echo-maze-pre-push-"));
  writeFileSync(
    join(directory, "npm"),
    [
      "#!/bin/sh",
      // Invoked as `npm run <step>`; $2 is the step.
      `if [ "$2" = "${failingStep ?? "__never__"}" ]; then`,
      '  echo "stub npm failing $2" >&2',
      `  exit ${failureStatus}`,
      "fi",
      "exit 0",
      ""
    ].join("\n"),
    { mode: 0o755 }
  );
  try {
    return spawnSync(/** @type {string} */ (shell), [".githooks/pre-push"], {
      encoding: "utf8",
      // ":" regardless of platform: the PATH is read by the POSIX shell this
      // spawns, not by Windows, and that shell splits on ":" everywhere.
      env: { ...process.env, PATH: `${directory}:${process.env.PATH ?? ""}` }
    });
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

/**
 * The gate is documented as PowerShell, where `sh` is usually absent but Git's
 * `bash` is on PATH. Falls back through both rather than skipping on Windows.
 */
const shell = ["sh", "bash"].find(
  (candidate) =>
    spawnSync(candidate, ["-c", "exit 0"], { encoding: "utf8" }).status === 0
);
const shellAvailable = shell !== undefined;

describe("pre-push hook", () => {
  it("runs exactly the steps `npm run check` runs, in the same order", () => {
    // The hook exists to name the failing step, which means owning the list.
    // If `check` gains a step, the hook must gain it too, or a push would sail
    // past a gate the repo believes it runs.
    expect(hookSteps()).toEqual(checkSteps());
  });

  it.skipIf(!shellAvailable)("names the step that failed", () => {
    const result = runHookWithStubbedNpm("typecheck");
    expect(result.status).not.toBe(0);
    const output = `${result.stdout}${result.stderr}`;
    // Matched against the report line, not the banner the hook prints before
    // every step — the banner alone would pass without the report existing.
    expect(output).toMatch(/pre-push FAILED at: typecheck/);
    expect(output).toContain("npm run typecheck");
  });

  it.skipIf(!shellAvailable)("stops at the first failure", () => {
    const result = runHookWithStubbedNpm("lint");
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).not.toBe(0);
    // A push blocked by lint should not also report any later step as run.
    for (const later of ["typecheck", "test", "build", "check:bundle"]) {
      expect(output).not.toContain(later);
    }
  });

  it.skipIf(!shellAvailable)("exits with the status the step exited with", () => {
    // Collapsing every failure to 1 would hide what the step actually reported.
    expect(runHookWithStubbedNpm("test", 2).status).toBe(2);
    expect(runHookWithStubbedNpm("build", 7).status).toBe(7);
  });

  it.skipIf(!shellAvailable)("still exits zero when every step passes", () => {
    const result = runHookWithStubbedNpm(null);
    expect(result.status).toBe(0);
  });
});
