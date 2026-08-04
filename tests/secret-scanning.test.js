import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * gitleaks is local tooling rather than a dependency, so nothing in the gate
 * can run it. What the gate can hold is the wiring: the audit's `GATE-1` is
 * cleared by a scan that someone can actually reproduce, and an allowlist
 * that stays narrow enough to mean something.
 */
describe("secret scanning", () => {
  it("keeps the scan one command away", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8")
    );
    expect(packageJson.scripts["security:secrets"]).toContain("gitleaks git");
    // `gitleaks git` walks history; `gitleaks dir` would only see the working
    // tree, which proves nothing about what a clone already carries.
    expect(packageJson.scripts["security:secrets"]).not.toContain(
      "gitleaks dir"
    );
    expect(packageJson.dependencies).not.toHaveProperty("gitleaks");
    expect(packageJson.devDependencies).not.toHaveProperty("gitleaks");
  });

  it("allowlists by file, rule, and shape rather than wholesale", async () => {
    const config = await readFile(
      new URL("../.gitleaks.toml", import.meta.url),
      "utf8"
    );
    expect(config).toContain("useDefault = true");
    expect(config).toContain("0017_verified_classroom_domains");
    // Scoped to values shaped like a domain name: a real key committed to the
    // same file is still reported.
    expect(config).toContain("regexTarget = \"match\"");
    expect(config).not.toMatch(/^\s*stopwords/m);
    // One allowlist block, and a second would be the point at which this
    // stops being a statement about specific strings.
    expect(config.match(/\[rules\.allowlist\]/g)?.length).toBe(1);
    expect(config).toContain("docs/secret-scanning");
    // Every path in it is constrained by the same domain-shaped value regex,
    // so a real key committed to either file is still reported.
    expect(config.match(/regexes = /g)?.length).toBe(1);
  });

  it("records a result that can be checked against a re-run", async () => {
    const doc = await readFile(
      new URL("../docs/secret-scanning.md", import.meta.url),
      "utf8"
    );
    expect(doc).toContain("no leaks found");
    expect(doc).toMatch(/gitleaks 8\.\d+\.\d+/);
    expect(doc).toMatch(/\d+ commits/);
  });
});
