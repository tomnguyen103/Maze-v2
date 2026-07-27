import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import access from "../api/access.js";
import admin from "../api/admin.js";

describe("Vercel function budget", () => {
  it("keeps every API route within the Hobby deployment limit", async () => {
    const functionFiles = await filesUnder(
      new URL("../api/", import.meta.url)
    );
    // 12 is the Hobby ceiling. We are AT it: every later phase must route new
    // endpoints through an existing function via a vercel.json rewrite, the way
    // /api/admin/* and /api/access/* already do, rather than adding a file.
    expect(functionFiles).toHaveLength(12);
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
        },
        {
          source: "/api/admin/:adminPath*",
          destination: "/api/admin?_adminPath=:adminPath*"
        }
      ])
    );
  });

  it("normalizes every admin path, including a bare /api/admin", async () => {
    // Without the trailing slash the router misses isAdminPath, calls next?.()
    // with no callback in a serverless function, and hangs until the platform
    // timeout instead of answering 401.
    for (const [incoming, expected] of [
      ["/api/admin?_adminPath=users/user_1/role", "/api/admin/users/user_1/role"],
      ["/api/admin", "/api/admin/"],
      ["/api/admin?_adminPath=", "/api/admin/"]
    ]) {
      const request = /** @type {import("node:http").IncomingMessage} */ (
        /** @type {unknown} */ ({ method: "POST", url: incoming, headers: {} })
      );
      const response = /** @type {import("node:http").ServerResponse} */ (
        /** @type {unknown} */ ({
          end() {},
          setHeader() {},
          statusCode: 0
        })
      );
      await admin(request, response);
      expect(request.url).toBe(expected);
      // Answered, not passed along: a serverless function has no next handler.
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    }
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
