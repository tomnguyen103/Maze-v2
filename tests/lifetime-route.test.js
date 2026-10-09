import { createServer } from "node:http";
import {
  createLifetimeHandler
} from "../server/lifetime-route.js";
import {
  LifetimeVerificationError,
  LifetimeWebhookVerificationError
} from "../server/lifetime-domain.js";
import { LifetimeOwnershipError } from "../server/lifetime-service.js";
import { UNMETERED } from "../server/rate-limit-config.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const servers = new Set();

/**
 * @param {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => unknown} handler
 * @param {(origin: string) => Promise<void>} callback
 */
async function withServer(handler, callback) {
  const server = createServer((request, response) => handler(request, response));
  servers.add(server);
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
    servers.delete(server);
  }
}

afterEach(async () => {
  for (const server of servers) {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
  servers.clear();
});

function service() {
  return {
    confirmCheckout: vi.fn().mockResolvedValue({
      canStartRun: true,
      lifetime: true,
      state: "lifetime_active"
    }),
    createCheckout: vi.fn().mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_echo",
      purchaseId: "purchase_123",
      state: "checkout_open"
    }),
    processWebhook: vi.fn().mockResolvedValue({ outcome: "processed" })
  };
}

describe("Lifetime Membership HTTP boundary", () => {
  it("creates Checkout from an empty authenticated request", async () => {
    const payment = service();
    const handler = createLifetimeHandler({
      getUserId: () => "user_explorer",
      service: payment
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/lifetime-checkout`, {
        method: "POST"
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_echo",
        purchaseId: "purchase_123",
        state: "checkout_open"
      });
    });
    expect(payment.createCheckout).toHaveBeenCalledWith("user_explorer");
  });

  it("rejects browser-supplied commercial fields", async () => {
    const payment = service();
    const handler = createLifetimeHandler({
      getUserId: () => "user_explorer",
      service: payment
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/lifetime-checkout`, {
        body: JSON.stringify({ amount: 1, currency: "cad" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      expect(response.status).toBe(400);
    });
    expect(payment.createCheckout).not.toHaveBeenCalled();
  });

  it("confirms only an opaque Checkout Session for the authenticated account", async () => {
    const payment = service();
    const handler = createLifetimeHandler({
      getUserId: () => "user_explorer",
      service: payment
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/lifetime-confirm`, {
        body: JSON.stringify({ sessionId: "cs_test_echo" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        lifetime: true,
        state: "lifetime_active"
      });
    });
    expect(payment.confirmCheckout).toHaveBeenCalledWith(
      "user_explorer",
      "cs_test_echo"
    );
  });

  it("passes untouched webhook bytes and the Stripe signature", async () => {
    const payment = service();
    const handler = createLifetimeHandler({
      getUserId: () => null,
      service: payment
    });
    const raw = '{"data":{"object":{"id":"cs_test_echo"}},"id":"evt_1"}';

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/stripe-webhook`, {
        body: raw,
        headers: {
          "content-type": "application/json",
          "stripe-signature": "t=1,v1=signed"
        },
        method: "POST"
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true });
    });
    expect(payment.processWebhook).toHaveBeenCalledOnce();
    expect(
      payment.processWebhook.mock.calls[0][0].equals(Buffer.from(raw))
    ).toBe(true);
    expect(payment.processWebhook.mock.calls[0][1]).toBe("t=1,v1=signed");
  });

  it("requires authentication for browser purchase routes", async () => {
    const payment = service();
    const handler = createLifetimeHandler({
      getUserId: () => null,
      service: payment
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/lifetime-checkout`, {
        method: "POST"
      });
      expect(response.status).toBe(401);
    });
  });

  it("advertises POST for unsupported methods", async () => {
    const handler = createLifetimeHandler({
      getUserId: () => "user_explorer",
      service: service()
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/lifetime-checkout`);
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    });
  });

  it.each([
    [new LifetimeOwnershipError(), 403],
    [new LifetimeVerificationError("Mismatch."), 400]
  ])("maps purchase verification failures without leaking details", async (
    error,
    expectedStatus
  ) => {
    const payment = service();
    payment.confirmCheckout.mockRejectedValue(error);
    const handler = createLifetimeHandler({
      getUserId: () => "user_explorer",
      service: payment
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/lifetime-confirm`, {
        body: JSON.stringify({ sessionId: "cs_test_echo" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      expect(response.status).toBe(expectedStatus);
      await expect(response.json()).resolves.toHaveProperty("error");
    });
  });

  it("US-04.3 returns a generic rejection for an invalid webhook signature", async () => {
    const payment = service();
    payment.processWebhook.mockRejectedValue(
      new LifetimeWebhookVerificationError()
    );
    const handler = createLifetimeHandler({
      getUserId: () => null,
      service: payment
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/stripe-webhook`, {
        body: "{}",
        headers: { "stripe-signature": "bad" },
        method: "POST"
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Webhook rejected."
      });
    });
  });

  it("US-04.2 answers 200 when the service ignores a wrong-mode event", async () => {
    const payment = service();
    payment.processWebhook.mockResolvedValue({
      outcome: "ignored",
      reason: "mode_mismatch"
    });
    const handler = createLifetimeHandler({
      getUserId: () => null,
      service: payment
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/stripe-webhook`, {
        body: "{}",
        headers: { "stripe-signature": "t=1,v1=signed" },
        method: "POST"
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true });
    });
  });
});

describe("Pilot checkout gate", () => {
  /** @param {(userId: string) => boolean} checkoutOpen */
  function gated(checkoutOpen, userId = "user_explorer") {
    const payment = service();
    const rateLimit = vi.fn(async () => UNMETERED);
    const recordAudit = vi.fn(async () => {});
    const handler = createLifetimeHandler({
      getUserId: () => userId,
      service: payment,
      rateLimit,
      recordAudit,
      checkoutOpen
    });
    return { handler, payment, rateLimit, recordAudit };
  }

  it("US-01.1 creates Checkout for a caller the gate opens", async () => {
    const target = gated((userId) => userId === "user_owner", "user_owner");

    await withServer(target.handler, async (origin) => {
      const response = await fetch(`${origin}/api/lifetime-checkout`, {
        method: "POST"
      });
      expect(response.status).toBe(200);
    });
    expect(target.payment.createCheckout).toHaveBeenCalledWith("user_owner");
  });

  it("US-01.3 answers 403 checkout_closed with no Checkout, rate-limit use or audit", async () => {
    const target = gated(() => false);

    await withServer(target.handler, async (origin) => {
      const response = await fetch(`${origin}/api/lifetime-checkout`, {
        method: "POST"
      });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "Lifetime Membership is not on sale yet.",
        code: "checkout_closed"
      });
    });
    expect(target.payment.createCheckout).not.toHaveBeenCalled();
    expect(target.rateLimit).not.toHaveBeenCalled();
    expect(target.recordAudit).not.toHaveBeenCalled();
  });

  it("US-01.3 asks a signed-out caller to sign in before the gate answers", async () => {
    const payment = service();
    const handler = createLifetimeHandler({
      getUserId: () => null,
      service: payment,
      checkoutOpen: () => false
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/lifetime-checkout`, {
        method: "POST"
      });
      expect(response.status).toBe(401);
    });
  });

  it("US-01.4 answers 403 to each repeated closed request and uses no rate limit", async () => {
    const target = gated(() => false);

    await withServer(target.handler, async (origin) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(`${origin}/api/lifetime-checkout`, {
          method: "POST"
        });
        expect(response.status).toBe(403);
      }
    });
    expect(target.rateLimit).not.toHaveBeenCalled();
  });

  it("US-01.5 keeps confirm and the webhook open while checkout is closed", async () => {
    const target = gated(() => false);

    await withServer(target.handler, async (origin) => {
      const confirm = await fetch(`${origin}/api/lifetime-confirm`, {
        body: JSON.stringify({ sessionId: "cs_test_echo" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      expect(confirm.status).toBe(200);
      const webhook = await fetch(`${origin}/api/stripe-webhook`, {
        body: '{"id":"evt_1"}',
        headers: {
          "content-type": "application/json",
          "stripe-signature": "t=1,v1=signed"
        },
        method: "POST"
      });
      expect(webhook.status).toBe(200);
    });
    expect(target.payment.confirmCheckout).toHaveBeenCalledOnce();
    expect(target.payment.processWebhook).toHaveBeenCalledOnce();
  });
});
