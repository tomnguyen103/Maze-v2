import { createHash } from "node:crypto";

/**
 * The salt is the whole privacy property here: an address hash is only 2^32
 * possibilities, so a known salt makes `ip_hash` trivially reversible.
 *
 * It also has to be stable across serverless containers, or the same address
 * lands in a different bucket per invocation and neither the rate limit nor the
 * audit `ip_hash` is comparable. `DATABASE_URL` is already a server-only secret
 * with exactly that lifetime, so it is the default source — but only when it
 * actually carries a secret. A local `postgres://postgres:postgres@localhost/db`
 * derives a guessable salt, which is worse than not hashing at all, so that case
 * is reported rather than trusted silently.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {{ salt: string, source: "configured" | "derived" | "none", weak: boolean }}
 */
export function describeAddressSalt(env) {
  const configured = env.REQUEST_ADDRESS_SALT;
  if (configured) {
    return { salt: configured, source: "configured", weak: false };
  }
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    return { salt: "", source: "none", weak: false };
  }
  return {
    salt: createHash("sha256")
      .update(`echo-maze:request-address:${connectionString}`)
      .digest("hex"),
    source: "derived",
    weak: hasGuessableSecret(connectionString)
  };
}

/** @param {string} connectionString */
function hasGuessableSecret(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return true;
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  return localHosts.has(url.hostname) || url.password.length < 16;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {string}
 */
export function resolveAddressSalt(env) {
  return describeAddressSalt(env).salt;
}

/**
 * Says once, at startup, where the address salt came from. A rotated database
 * password silently re-keys every hash — new audit rows stop correlating with
 * old ones and every guest rate-limit bucket resets — so the source belongs in
 * the logs rather than only in the README.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {(message: string, details: Record<string, unknown>) => void} [warn]
 */
export function reportAddressSalt(env, warn = (message, details) =>
  console.warn(message, details)
) {
  const { source, weak } = describeAddressSalt(env);
  if (source === "none") {
    return;
  }
  if (weak) {
    warn(
      "[request-identity] address salt derived from a DATABASE_URL with no strong secret; set REQUEST_ADDRESS_SALT so ip_hash cannot be reversed.",
      { source }
    );
    return;
  }
  warn("[request-identity] address salt in use.", { source });
}

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env */
export function trustsProxyHeaders(env) {
  return env.TRUST_PROXY_HEADERS === "true";
}

/**
 * `x-forwarded-for` is client-controlled unless a proxy is known to rewrite it,
 * so it is honoured only when the deployment says so. Behind Vercel that header
 * is authoritative; on a directly exposed server, trusting it would let one
 * caller spend everyone else's rate-limit budget — or dodge their own.
 *
 * @param {import("node:http").IncomingMessage} request
 * @param {boolean} trustProxy
 * @returns {string | null}
 */
export function clientAddress(request, trustProxy) {
  const socketAddress = request.socket?.remoteAddress || null;
  if (!trustProxy) {
    return socketAddress;
  }
  const forwarded = request.headers["x-forwarded-for"];
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = header?.split(",")[0]?.trim();
  return first || socketAddress;
}

/**
 * Daily-rotating address hash. Raw addresses never reach the database, and two
 * days of traffic from one address are not linkable.
 *
 * @param {string | null | undefined} address
 * @param {{ salt: string, date: string }} options
 * @returns {string | null}
 */
export function hashClientAddress(address, { salt, date }) {
  if (!address || !salt) {
    return null;
  }
  return createHash("sha256").update(`${address}:${date}:${salt}`).digest("hex");
}

/**
 * @param {{
 *   salt?: string,
 *   trustProxy?: boolean,
 *   today?: () => string
 * }} [options]
 */
export function createAddressHasher({
  salt = "",
  trustProxy = false,
  today = () => new Date().toISOString().slice(0, 10)
} = {}) {
  /** @param {import("node:http").IncomingMessage} request */
  return function addressHashFor(request) {
    return hashClientAddress(clientAddress(request, trustProxy), {
      salt,
      date: today()
    });
  };
}
