const CONFIG_KEYS = [
  "AUDIT_CHECKPOINT_BUCKET",
  "AUDIT_CHECKPOINT_REGION",
  "AUDIT_CHECKPOINT_ACCESS_KEY_ID",
  "AUDIT_CHECKPOINT_SECRET_ACCESS_KEY",
  "AUDIT_CHECKPOINT_HMAC_KEY",
  "AUDIT_CHECKPOINT_RETENTION_DAYS"
];

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env */
export function loadAuditCheckpointConfig(env = process.env) {
  const forcePathStyle = env.AUDIT_CHECKPOINT_FORCE_PATH_STYLE;
  if (
    forcePathStyle &&
    forcePathStyle !== "true" &&
    forcePathStyle !== "false"
  ) {
    throw new Error(
      "AUDIT_CHECKPOINT_FORCE_PATH_STYLE must be true or false."
    );
  }
  const configured =
    CONFIG_KEYS.some((key) => Boolean(env[key])) ||
    Boolean(env.AUDIT_CHECKPOINT_ENDPOINT) ||
    Boolean(forcePathStyle);
  if (!configured) {
    return null;
  }
  const missing = CONFIG_KEYS.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error("Audit checkpoint configuration is incomplete.");
  }
  const retentionDays = Number(env.AUDIT_CHECKPOINT_RETENTION_DAYS);
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error(
      "AUDIT_CHECKPOINT_RETENTION_DAYS must be a positive integer."
    );
  }
  return {
    bucket: /** @type {string} */ (env.AUDIT_CHECKPOINT_BUCKET),
    region: /** @type {string} */ (env.AUDIT_CHECKPOINT_REGION),
    accessKeyId: /** @type {string} */ (
      env.AUDIT_CHECKPOINT_ACCESS_KEY_ID
    ),
    secretAccessKey: /** @type {string} */ (
      env.AUDIT_CHECKPOINT_SECRET_ACCESS_KEY
    ),
    signingKey: /** @type {string} */ (env.AUDIT_CHECKPOINT_HMAC_KEY),
    retentionDays,
    endpoint: env.AUDIT_CHECKPOINT_ENDPOINT || undefined,
    forcePathStyle: forcePathStyle === "true"
  };
}
