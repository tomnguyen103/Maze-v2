// Strict security headers shared by every way the app is served: local Express
// (`server.js`), the Vite dev and preview servers (`vite.config.js`), and
// Vercel's static edge (`vercel.json` mirrors these for built assets).
//
// The app has no inline script and no inline style, so the policy needs neither
// 'unsafe-inline' nor a nonce. Keep it that way: adding an inline script means
// weakening this file.

/** Powerful features the game never uses. */
const DENIED_FEATURES = [
  "accelerometer",
  "camera",
  "display-capture",
  "geolocation",
  "gyroscope",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "serial",
  "usb"
];

/**
 * Clerk publishable keys carry their instance host base64-encoded in the third
 * underscore-separated segment. `src/player/clerk-browser.js` decodes the same
 * value in the browser to load the optional Clerk UI bundle, so the policy has
 * to allow exactly that host.
 *
 * @param {string | undefined} publishableKey
 * @returns {string | null}
 */
export function clerkHostFromPublishableKey(publishableKey) {
  const encoded = publishableKey?.split("_")[2];
  if (!encoded) {
    return null;
  }
  let decoded;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }
  const host = decoded.replace(/\$$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? host : null;
}

/**
 * @param {{ clerkHost?: string | null, production?: boolean }} options
 */
export function contentSecurityPolicy({ clerkHost = null, production = false }) {
  const clerkOrigin = clerkHost ? [`https://${clerkHost}`] : [];
  const clerkImages = clerkHost ? ["https://img.clerk.com"] : [];
  /** @type {[string, string[]][]} */
  const policy = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'none'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    // Stripe-hosted Checkout is reached by redirect, never by script.
    ["form-action", ["'self'", "https://checkout.stripe.com"]],
    ["script-src", ["'self'", ...clerkOrigin]],
    ["style-src", ["'self'"]],
    ["font-src", ["'self'"]],
    ["img-src", ["'self'", "data:", ...clerkImages]],
    ["connect-src", ["'self'", ...clerkOrigin]],
    // Clerk runs its telemetry and crypto helpers in blob workers.
    ["worker-src", ["'self'", "blob:"]],
    // Clerk hosts sign-in components and bot protection in frames.
    [
      "frame-src",
      ["'self'", ...clerkOrigin, ...(clerkHost ? ["https://challenges.cloudflare.com"] : [])]
    ],
    ["manifest-src", ["'self'"]]
  ];
  const serialized = policy
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
  // Pointless over plain local HTTP, and it would break the dev server.
  return production
    ? `${serialized}; upgrade-insecure-requests`
    : serialized;
}

/**
 * @param {{ clerkHost?: string | null, production?: boolean }} options
 * @returns {Record<string, string>}
 */
export function securityHeaders({ clerkHost = null, production = false }) {
  return {
    "content-security-policy": contentSecurityPolicy({ clerkHost, production }),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    // Redundant with frame-ancestors, kept for browsers that predate CSP3.
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": DENIED_FEATURES.map(
      (feature) => `${feature}=()`
    ).join(", "),
    ...(production
      ? {
          "strict-transport-security": "max-age=31536000; includeSubDomains"
        }
      : {})
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function createSecurityHeadersMiddleware(env = process.env) {
  const headers = securityHeaders({
    clerkHost: clerkHostFromPublishableKey(
      env.CLERK_PUBLISHABLE_KEY || env.VITE_CLERK_PUBLISHABLE_KEY
    ),
    production: env.NODE_ENV === "production" || env.VERCEL_ENV === "production"
  });
  /**
   * @param {import("node:http").IncomingMessage} _request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return function securityHeadersMiddleware(_request, response, next) {
    for (const [name, value] of Object.entries(headers)) {
      response.setHeader(name, value);
    }
    next?.();
  };
}
