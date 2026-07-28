import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createClerkWebhookHandler } from "../server/clerk-webhook-route.js";

/**
 * @param {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void | Promise<void>} handler
 * @param {(origin: string) => Promise<void>} callback
 */
async function withServer(handler, callback) {
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(undefined))
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not start.");
  }
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve(undefined)))
    );
  }
}

describe("Clerk webhook", () => {
  it("verifies user.deleted before removing account data", async () => {
    const deleteUser = vi.fn();
    const verifyEvent = vi.fn(async () => ({
      type: "user.deleted",
      data: { id: "user_deleted" }
    }));
    const handler = createClerkWebhookHandler({
      deleteUser,
      verifyEvent
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/clerk-webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "svix-id": "msg_test"
        },
        body: JSON.stringify({
          type: "user.deleted",
          data: { id: "untrusted_body" }
        })
      });

      expect(response.status).toBe(200);
      expect(deleteUser).toHaveBeenCalledWith("user_deleted");
      expect(verifyEvent).toHaveBeenCalledOnce();
    });
  });

  it("rejects an unverifiable event without deleting data", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const deleteUser = vi.fn();
    const handler = createClerkWebhookHandler({
      deleteUser,
      verifyEvent: vi.fn(async () => {
        throw new Error("bad signature");
      })
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/clerk-webhook`, {
        method: "POST",
        body: "{}"
      });

      expect(response.status).toBe(400);
      expect(deleteUser).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("[clerk-webhook] Event rejected", {
        name: "Error"
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("bad signature");
    });
    log.mockRestore();
  });

  it("acknowledges unrelated verified events without deleting data", async () => {
    const deleteUser = vi.fn();
    const handler = createClerkWebhookHandler({
      deleteUser,
      verifyEvent: vi.fn(async () => ({
        type: "user.updated",
        data: { id: "user_kept" }
      }))
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/clerk-webhook`, {
        method: "POST",
        body: "{}"
      });

      expect(response.status).toBe(200);
      expect(deleteUser).not.toHaveBeenCalled();
    });
  });

  it("stores a minimized realistic organization membership event", async () => {
    const inbox = {
      receive: vi.fn(async () => ({
        duplicate: false,
        processed: true
      }))
    };
    const handler = createClerkWebhookHandler({
      deleteUser: vi.fn(),
      inbox,
      verifyEvent: vi.fn(async () => ({
        type: "organizationMembership.created",
        timestamp: 1750000000123,
        data: {
          id: "orgmem_student",
          object: "organization_membership",
          role: "org:member",
          organization: {
            id: "org_classroom",
            name: "Morning Explorers",
            private_metadata: { secret: "must-not-enter-inbox" }
          },
          public_user_data: {
            user_id: "user_student",
            identifier: "student@example.test"
          },
          public_metadata: { extra: "discard" },
          updated_at: 1750000000000
        }
      }))
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/clerk-webhook`, {
        method: "POST",
        headers: { "svix-id": "msg_membership" },
        body: "{}"
      });

      expect(response.status).toBe(200);
      expect(inbox.receive).toHaveBeenCalledWith({
        provider: "clerk",
        eventId: "msg_membership",
        eventType: "organizationMembership.created",
        payload: {
          id: "orgmem_student",
          classroomId: "org_classroom",
          userId: "user_student",
          role: "org:member",
          occurredAt: 1750000000123
        }
      });
      expect(JSON.stringify(inbox.receive.mock.calls)).not.toContain(
        "student@example.test"
      );
      expect(JSON.stringify(inbox.receive.mock.calls)).not.toContain(
        "must-not-enter-inbox"
      );
    });
  });

  it("stores only the verified primary email domain for auto-join", async () => {
    const inbox = {
      receive: vi.fn(async () => ({
        duplicate: false,
        processed: true
      }))
    };
    const handler = createClerkWebhookHandler({
      deleteUser: vi.fn(),
      inbox,
      verifyEvent: vi.fn(async () => ({
        type: "user.updated",
        timestamp: 1750000000123,
        data: {
          id: "user_student",
          primary_email_address_id: "idn_primary",
          email_addresses: [
            {
              id: "idn_primary",
              email_address: "Student@School.Example",
              verification: { status: "verified" }
            }
          ],
          first_name: "must-not-enter-inbox",
          private_metadata: { secret: "must-not-enter-inbox" }
        }
      }))
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/clerk-webhook`, {
        method: "POST",
        headers: { "svix-id": "msg_user_updated" },
        body: "{}"
      });

      expect(response.status).toBe(200);
      expect(inbox.receive).toHaveBeenCalledWith({
        provider: "clerk",
        eventId: "msg_user_updated",
        eventType: "user.updated",
        payload: {
          id: "user_student",
          emailDomain: "school.example",
          occurredAt: 1750000000123
        }
      });
      expect(JSON.stringify(inbox.receive.mock.calls)).not.toContain(
        "Student@School.Example"
      );
      expect(JSON.stringify(inbox.receive.mock.calls)).not.toContain(
        "must-not-enter-inbox"
      );
    });
  });

  it("fails closed when a Classroom event cannot enter the durable inbox", async () => {
    const inbox = { receive: vi.fn() };
    const handler = createClerkWebhookHandler({
      deleteUser: vi.fn(),
      inbox,
      verifyEvent: vi.fn(async () => ({
        type: "organization.deleted",
        timestamp: 1750000000123,
        data: { id: "org_classroom", object: "organization", deleted: true }
      }))
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/clerk-webhook`, {
        method: "POST",
        body: "{}"
      });

      expect(response.status).toBe(400);
      expect(inbox.receive).not.toHaveBeenCalled();
    });
  });

  it("returns a retryable server error when verified deletion fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const deleteUser = vi.fn(async () => {
      throw new Error("database password must-not-leak");
    });
    const handler = createClerkWebhookHandler({
      deleteUser,
      verifyEvent: vi.fn(async () => ({
        type: "user.deleted",
        data: { id: "user_deleted" }
      }))
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/clerk-webhook`, {
        method: "POST",
        body: "{}"
      });

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "Account deletion is temporarily unavailable."
      });
    });
    expect(log).toHaveBeenCalledWith(
      "[clerk-webhook] Account deletion failed",
      { name: "Error" }
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("must-not-leak");
    log.mockRestore();
  });
});
