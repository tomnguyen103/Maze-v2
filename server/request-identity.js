import { createHash } from "node:crypto";

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
