import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import access from "../api/access.js";

describe("Vercel function budget", () => {
  it("keeps every API route within the Hobby deployment limit", async () => {
    const functionFiles = await filesUnder(
      new URL("../api/", import.meta.url)
    );
    expect(functionFiles).toHaveLength(11);
    expect(functionFiles.length).toBeLessThanOrEqual(12);

    const config = JSON.parse(
      await readFile(
        new URL("../vercel.json", import.meta.url),
        "utf8"
      )
    );
    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        {
          source: "/api/access/config",
          destination: "/api/access?_accessRoute=config"
        },
        {
          source: "/api/access/runs",
          destination: "/api/access?_accessRoute=runs"
        }
      ])
    );
  });

  it("restores the public nested Access path before server routing", async () => {
    const request = /** @type {import("node:http").IncomingMessage} */ ({
      method: "GET",
      url: "/api/access?_accessRoute=config"
    });
    const response = /** @type {import("node:http").ServerResponse} */ (
      /** @type {unknown} */ ({
        end() {},
        setHeader() {},
        statusCode: 0
      })
    );

    await access(request, response);

    expect(request.url).toBe("/api/access/config");
    expect(response.statusCode).toBe(200);
  });
});

/** @param {URL} directory @returns {Promise<string[]>} */
async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  /** @type {string[][]} */
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? filesUnder(new URL(`${entry.name}/`, directory))
        : Promise.resolve([entry.name])
    )
  );
  return nested.flat();
}
