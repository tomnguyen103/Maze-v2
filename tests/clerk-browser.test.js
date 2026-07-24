import { describe, expect, it, vi } from "vitest";
import { createClerkBrowser } from "../src/player/clerk-browser.js";

describe("Clerk browser initializer", () => {
  it("does not load Clerk or block guest play without a publishable key", async () => {
    let attemptedLoad = false;
    const clerkBrowser = createClerkBrowser({
      env: {},
      loadClerkModule: async () => {
        attemptedLoad = true;
        throw new Error("Clerk should not load without configuration.");
      }
    });

    await expect(clerkBrowser.initialize()).resolves.toBe(false);
    await expect(clerkBrowser.openSignIn()).resolves.toBe(false);
    expect(attemptedLoad).toBe(false);
    expect(clerkBrowser.user).toBeNull();
  });

  it("loads Echo Maze appearance variables before opening Clerk SignIn", async () => {
    const originalDocument = globalThis.document;
    const originalGetComputedStyle = globalThis.getComputedStyle;
    let instance = /** @type {any} */ (null);
    class FakeClerk {
      constructor() {
        instance = this;
        this.session = { getToken: async () => "test-token" };
        this.user = { id: "user_123" };
        this.openedSignIn = false;
      }

      async load(/** @type {any} */ options) {
        this.loadOptions = options;
      }

      addListener() {}

      openSignIn() {
        this.openedSignIn = true;
      }
    }
    globalThis.document = /** @type {Document} */ ({ documentElement: {} });
    globalThis.getComputedStyle = /** @type {typeof getComputedStyle} */ (
      () => /** @type {CSSStyleDeclaration} */ (/** @type {unknown} */ ({
        getPropertyValue: (/** @type {string} */ token) => `token:${token}`
      }))
    );

    try {
      const clerkBrowser = createClerkBrowser({
        env: { VITE_CLERK_PUBLISHABLE_KEY: "pk_test_example" },
        loadClerkModule: async () => ({ Clerk: FakeClerk })
      });

      await expect(clerkBrowser.initialize()).resolves.toBe(true);
      await expect(clerkBrowser.openSignIn()).resolves.toBe(true);
      expect(instance?.loadOptions).toMatchObject({
        appearance: {
          variables: {
            colorPrimary: "token:--color-signal-deep",
            colorForeground: "token:--color-ink",
            fontFamily: "token:--font-body"
          }
        }
      });
      expect(instance?.openedSignIn).toBe(true);
      expect(clerkBrowser.user).toEqual({ id: "user_123" });
    } finally {
      globalThis.document = originalDocument;
      globalThis.getComputedStyle = originalGetComputedStyle;
    }
  });

  it("fails closed when Clerk initialization does not finish", async () => {
    const originalDocument = globalThis.document;
    const originalGetComputedStyle = globalThis.getComputedStyle;
    /** @type {(value: unknown) => void} */
    let resolveLoad = () => {};
    let listenerCount = 0;
    class SlowClerk {
      load() {
        return new Promise((resolve) => {
          resolveLoad = resolve;
        });
      }

      addListener() {
        listenerCount += 1;
      }
    }
    globalThis.document = /** @type {Document} */ ({ documentElement: {} });
    globalThis.getComputedStyle = /** @type {typeof getComputedStyle} */ (
      () => /** @type {CSSStyleDeclaration} */ (/** @type {unknown} */ ({
        getPropertyValue: () => "token"
      }))
    );
    vi.useFakeTimers();

    try {
      const clerkBrowser = createClerkBrowser({
        env: { VITE_CLERK_PUBLISHABLE_KEY: "pk_test_example" },
        loadClerkModule: async () => ({ Clerk: SlowClerk })
      });
      const initialization = clerkBrowser.initialize();

      await vi.advanceTimersByTimeAsync(8000);

      await expect(initialization).resolves.toBe(false);
      resolveLoad(undefined);
      await Promise.resolve();
      expect(listenerCount).toBe(0);
    } finally {
      vi.useRealTimers();
      globalThis.document = originalDocument;
      globalThis.getComputedStyle = originalGetComputedStyle;
    }
  });
});
