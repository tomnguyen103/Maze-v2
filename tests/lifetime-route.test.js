import { createServer } from "node:http";
import {
  createLifetimeHandler
} from "../server/lifetime-route.js";
import {
  LifetimeWebhookVerificationError
} from "../server/lifetime-domain.js";
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

  it("returns a generic rejection for an invalid webhook signature", async () => {
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
});
