import { safeErrorName } from "./safe-error-log.js";

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
      instrumentations: [new HttpInstrumentation(), new PgInstrumentation()]
    });
    sdk.start();
    return sdk;
  } catch (error) {
    console.warn("[tracing] disabled", { name: safeErrorName(error) });
    return null;
  }
}
