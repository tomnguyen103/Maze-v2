import { describe, expect, it, vi } from "vitest";
import { createAccessSettingsStore } from "../server/access-settings-store.js";

const SETTINGS = /** @type {const} */ ({
  version: 1,
  highContrast: true,
  largeMarks: false,
  readerFriendlyQuestions: true,
  reducedEffects: false
});

const ROW = {
  schema_version: 1,
  high_contrast: true,
  large_marks: false,
  reader_friendly_questions: true,
  reduced_effects: false,
  revision: 3,
  updated_at: "2026-07-28T00:00:00.000Z"
};

describe("Explorer Access Settings store", () => {
  it("maps the authenticated Explorer's record", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [ROW] }) };

    await expect(
      createAccessSettingsStore(database).get("user_123")
    ).resolves.toEqual({
      settings: SETTINGS,
      revision: 3,
      updatedAt: "2026-07-28T00:00:00.000Z"
    });
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE clerk_user_id = $1"),
      ["user_123"]
    );
  });

  it("creates revision one only for an active identity", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [{ ...ROW, revision: 1 }] }) };

    const result = await createAccessSettingsStore(database).save(
      "user_123",
      0,
      SETTINGS
    );

    expect(result).toMatchObject({ conflict: false, duplicate: false });
    expect(database.query.mock.calls[0][0]).toContain("active_user AS MATERIALIZED");
    expect(database.query.mock.calls[0][0]).toContain(
      "INSERT INTO explorer_access_settings"
    );
    expect(database.query.mock.calls[0][1][0]).toBe("user_123");
    expect(database.query.mock.calls[0][1].at(-1)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("updates only the expected revision and returns a stale conflict", async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [ROW] })
    };

    const result = await createAccessSettingsStore(database).save(
      "user_123",
      2,
      { ...SETTINGS, highContrast: false }
    );

    expect(database.query.mock.calls[0][0]).toContain("revision = $2");
    expect(result).toMatchObject({
      conflict: true,
      duplicate: false,
      record: { revision: 3 }
    });
  });

  it("recognizes an identical retry without changing revision", async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [ROW] })
    };

    await expect(
      createAccessSettingsStore(database).save("user_123", 2, SETTINGS)
    ).resolves.toMatchObject({ conflict: false, duplicate: true });
  });

  it("reports a deleted identity instead of an initial-save conflict", async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ exists: 1 }] })
    };

    await expect(
      createAccessSettingsStore(database).save("user_123", 0, SETTINGS)
    ).rejects.toMatchObject({ name: "DeletedUserError" });
  });
});
