import { safeErrorName } from "./safe-error-log.js";

/**
 * Attributes blanked on every HTTP span. `client.address` is the caller's raw
 * IP; `url.query` and the `http.target`/`url.full` pair carry the query
 * string, which is where the admin export puts the Explorer it is exporting.
 * Spans leave this process for a backend that erasure never reaches, and the
 * callers here are children.
 *
 * The deprecated names are blanked too: which pair an instrumentation emits
 * depends on its semantic-convention mode, and the default is not pinned.
 */
/**
 * Deletes the suppressed attributes from every span as it ends.
 *
 * `SpanProcessor` is an interface, so this only has to answer the four
 * methods the SDK calls; it needs none of the optional packages at import
 * time, which is what keeps this module free of them until tracing is armed.
 */
class RedactingSpanProcessor {
  /** @param {{ attributes?: Record<string, unknown> }} span */
  onEnd(span) {
    if (!span?.attributes) return;
    for (const attribute of SUPPRESSED_HTTP_ATTRIBUTES) {
      delete span.attributes[attribute];
    }
  }
  onStart() {}
  async forceFlush() {}
  async shutdown() {}
}

export const SUPPRESSED_HTTP_ATTRIBUTES = Object.freeze([
  "client.address",
  "net.peer.ip",
  "http.client_ip",
  "url.query",
  "url.full",
  "http.url",
  "http.target"
]);

/**
 * Env-gated OpenTelemetry. Unset `OTEL_EXPORTER_OTLP_ENDPOINT` means none of
 * the SDK packages are even imported — zero overhead locally and in tests.
 * The exporter reads the standard `OTEL_EXPORTER_OTLP_*` variables itself.
 *
 * Initialisation failures are swallowed with a warning: tracing must never
 * be why the game cannot start.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {Promise<import("@opentelemetry/sdk-node").NodeSDK | null>}
 */
export async function initTracing(env = globalThis.process.env) {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return null;
  }
  try {
    const [
      { NodeSDK },
      { OTLPTraceExporter },
      { HttpInstrumentation },
      { PgInstrumentation }
    ] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/instrumentation-http"),
      import("@opentelemetry/instrumentation-pg")
    ]);
    const sdk = new NodeSDK({
      serviceName: "echo-maze",
      traceExporter: new OTLPTraceExporter(),
      instrumentations: [new HttpInstrumentation(), new PgInstrumentation()],
      // Redaction on `onEnd` rather than through
      // `applyCustomAttributesOnSpan`: that hook runs only on the normal
      // response path, so an aborted or errored request would still have
      // exported the caller's address and the full target. Every span passes
      // through here, whatever ended it.
      spanProcessors: [new RedactingSpanProcessor()]
    });
    sdk.start();
    return sdk;
  } catch (error) {
    console.warn("[tracing] disabled", { name: safeErrorName(error) });
    return null;
  }
}
