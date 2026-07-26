import {
  normalizeDatabaseConnectionString
} from "../server/database.js";
import { describe, expect, it } from "vitest";

describe("database connection security", () => {
  it("requires full certificate verification for hosted PostgreSQL", () => {
    expect(
      normalizeDatabaseConnectionString(
        "postgresql://user:secret@example.neon.tech/maze?sslmode=require"
      )
    ).toBe(
      "postgresql://user:secret@example.neon.tech/maze?sslmode=verify-full"
    );
  });

  it("preserves an explicitly verified connection", () => {
    expect(
      normalizeDatabaseConnectionString(
        "postgresql://user:secret@example.neon.tech/maze?sslmode=verify-full"
      )
    ).toBe(
      "postgresql://user:secret@example.neon.tech/maze?sslmode=verify-full"
    );
  });

  it("allows local PostgreSQL without forcing TLS", () => {
    expect(
      normalizeDatabaseConnectionString(
        "postgresql://user:secret@127.0.0.1:5432/maze"
      )
    ).toBe("postgresql://user:secret@127.0.0.1:5432/maze");
  });

  it("recognizes the bracketed IPv6 loopback hostname as local", () => {
    expect(
      normalizeDatabaseConnectionString(
        "postgresql://user:secret@[::1]:5432/maze"
      )
    ).toBe("postgresql://user:secret@[::1]:5432/maze");
  });
});
