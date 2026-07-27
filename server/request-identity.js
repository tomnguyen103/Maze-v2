import { createHash } from "node:crypto";

/**
 * Resolving the address salt needs a value that is stable across serverless
 * containers, or the same address lands in a different bucket per invocation and
 * neither the rate limit nor the audit `ip_hash` is comparable. `DATABASE_URL`
 * is already a server-only secret with exactly that lifetime, so it is the
 * default source. `REQUEST_ADDRESS_SALT` overrides it.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {string} Empty only when there is no database configured at all, in
 *   which case there is nothing to key against anyway.
 */
export function resolveAddressSalt(env) {
  const configured = env.REQUEST_ADDRESS_SALT;
  if (configured) {
    return configured;
  }
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    return "";
  }
  return createHash("sha256")
    .update(`echo-maze:request-address:${connectionString}`)
    .digest("hex");
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
