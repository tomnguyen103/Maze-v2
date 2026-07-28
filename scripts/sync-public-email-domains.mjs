import { readFile, writeFile } from "node:fs/promises";
import {
  PUBLIC_EMAIL_DOMAINS,
  PUBLIC_EMAIL_DOMAIN_SOURCE
} from "../server/classroom-domain.js";

const migrationUrl = new URL(
  "../db/migrations/0017_verified_classroom_domains.sql",
  import.meta.url
);
const startMarker = "-- BEGIN GENERATED PUBLIC EMAIL DOMAINS";
const endMarker = "-- END GENERATED PUBLIC EMAIL DOMAINS";
const sourceVersion = PUBLIC_EMAIL_DOMAIN_SOURCE?.version;
const sourcePackage = PUBLIC_EMAIL_DOMAIN_SOURCE?.package;
if (sourcePackage !== "free-email-domains" || sourceVersion !== "1.9.77") {
  throw new Error("The vendored public email domain source is invalid.");
}

const domains = [...PUBLIC_EMAIL_DOMAINS].sort();
const chunkSize = 12;
const values = [];
for (let index = 0; index < domains.length; index += chunkSize) {
  const chunk = domains
    .slice(index, index + chunkSize)
    .map((domain) => `'${domain.replaceAll("'", "''")}'`);
  const suffix = index + chunkSize >= domains.length ? "" : ",";
  values.push(`  ${chunk.join(", ")}${suffix}`);
}
const generated = [
  startMarker,
  `-- Source: vendored ${sourcePackage} ${sourceVersion} tarball snapshot plus reviewed supplements.`,
  `-- Runtime source: data/public-email-domains.json; ${domains.length} tracked shared providers.`,
  "-- Run `npm run sync:public-domains` after updating the tracked snapshot.",
  "INSERT INTO public_email_domains (domain)",
  "SELECT UNNEST(ARRAY[",
  ...values,
  "]::TEXT[]);",
  endMarker
].join("\n");
const migration = await readFile(migrationUrl, "utf8");
const start = migration.indexOf(startMarker);
const end = migration.indexOf(endMarker);

if (start < 0 || end < start) {
  throw new Error("Public email domain generation markers are missing.");
}

const nextMigration =
  migration.slice(0, start) +
  generated +
  migration.slice(end + endMarker.length);
await writeFile(migrationUrl, nextMigration, "utf8");
console.log(`Synced ${domains.length} public email domains.`);
