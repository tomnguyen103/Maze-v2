import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CAMPAIGN_CODES } from "../shared/campaign-codes.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const KIT = "docs/acquisition";
const NO_OFFER_RULE =
  "- The kit offers no discount, coupon, affiliate commission, free Lifetime grant or second price.";
const OWNER_RULE = "The owner approves and sends each item.";

/** @param {string} path */
function read(path) {
  return readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
}

/** @param {string} text */
function tableRows(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\| :?--/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

/**
 * @param {string} text
 * @param {string} heading
 */
function section(text, heading) {
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) return "";
  const rest = text.slice(start + heading.length + 1);
  const next = rest.search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next);
}

const files = readdirSync(join(root, KIT)).filter((name) => name.endsWith(".md"));
const kit = new Map(files.map((name) => [name, read(`${KIT}/${name}`)]));
const readme = kit.get("README.md") ?? "";

describe("Acquisition kit", () => {
  it("US-06.1 holds the experiment log template with the plan fields", () => {
    const [header] = tableRows(kit.get("experiment-log.md") ?? "");

    expect(header).toEqual([
      "Creative",
      "Audience",
      "Date",
      "Campaign Code",
      "Visits",
      "Purchases",
      "Refunds",
      "Cash cost",
      "Owner minutes"
    ]);
  });

  it("US-06.2 uses only known Campaign Codes", () => {
    const linked = [...kit.values()].flatMap((text) =>
      [...text.matchAll(/[?&]c=([^`\s)&]+)/g)].map((match) => match[1])
    );
    const tabled = tableRows(section(readme, "## Primary channels"))
      .slice(1)
      .map((cells) => cells[1].replace(/`/g, ""));

    expect(linked.length).toBeGreaterThan(0);
    for (const code of [...linked.filter((code) => code !== "<code>"), ...tabled]) {
      expect(CAMPAIGN_CODES).toContain(code);
    }
  });

  it("US-06.3 offers no discount, affiliate, free Lifetime grant or second price", () => {
    expect(readme).toContain(NO_OFFER_RULE);
    for (const [name, text] of kit) {
      const offers = text.replace(NO_OFFER_RULE, "");
      expect(offers, name).not.toMatch(
        /discount|coupon|promo code|affiliate|free lifetime|% off|second price/i
      );
      for (const [amount] of offers.matchAll(/\$\d+(?:\.\d+)?/g)) {
        expect(amount, name).toBe("$5.99");
      }
    }
  });

  it("US-06.4 gives each primary channel two creatives from the kit", () => {
    const rows = tableRows(section(readme, "## Primary channels")).slice(1);
    const drafts = `${kit.get("clip-briefs.md")}\n${kit.get("homeschool-posts.md")}`;

    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const [channel, , creativeA, creativeB] of rows) {
      expect(creativeA, channel).not.toBe(creativeB);
      for (const creative of [creativeA, creativeB]) {
        expect(drafts, channel).toMatch(new RegExp(`^## ${creative}: `, "m"));
      }
    }
  });

  it("US-06.5 states owner approval and holds no contact data", () => {
    expect(readme).toContain(OWNER_RULE);
    for (const [name, text] of kit) {
      expect(text, name).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(text, name).not.toMatch(/(?:^|\s)@\w/);
      expect(text, name).not.toMatch(/\+?\d[\d ().-]{8,}\d/);
      expect(text, name).not.toMatch(/https?:\/\//);
    }
  });
});

describe("Pilot checkout gate records", () => {
  it("US-07.1 defines Pilot Account and Public Checkout in the glossary", () => {
    const glossary = read("GLOSSARY.md");

    for (const term of ["Pilot Account", "Public Checkout"]) {
      expect(glossary).toMatch(
        new RegExp(`^\\*\\*${term}\\*\\*:\\n.+\\n(?:.+\\n)*_Avoid_: `, "m")
      );
    }
  });

  it("US-07.2 records the gate, the enforcement coupling and the removal condition", () => {
    const adr = read("docs/adr/0050-owner-pilot-checkout-gate.md");

    expect(adr).toContain("resolveCheckoutGate");
    expect(adr).toContain("checkout_closed");
    expect(adr).toContain("RUN_ACCESS_ENFORCEMENT_ENABLED");
    expect(section(adr, "## Removal condition")).toContain("LIFETIME_PILOT_ACCOUNT_IDS");
    expect(section(adr, "## Removal condition")).toContain("both variables");
  });

  it("US-07.3 labels the gate code as temporary with its removal condition", () => {
    const config = read("server/lifetime-config.js");

    expect(config).toMatch(/temporary: .+\n.+Remove this gate/);
  });
});
