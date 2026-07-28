import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { AuditCheckpointExistsError } from "./audit-checkpoint.js";
import { loadAuditCheckpointConfig } from "./audit-checkpoint-config.js";

export { AuditCheckpointExistsError };
export { loadAuditCheckpointConfig };

const CHECKPOINT_PREFIX = "audit-checkpoints/v1/";
const MAX_RETAINED_CHECKPOINTS = 4096;
const MAX_CHECKPOINT_BODY_BYTES = 4096;

/** @param {NonNullable<ReturnType<typeof loadAuditCheckpointConfig>>} config */
export function createConfiguredAuditCheckpointSink(config) {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
  return createS3AuditCheckpointSink({ client, bucket: config.bucket });
}

/**
 * @param {{
 *   client: any,
 *   bucket: string
 * }} dependencies
 */
export function createS3AuditCheckpointSink({ client, bucket }) {
  /** @param {string} key @param {string | undefined} [versionId] */
  async function get(key, versionId = undefined) {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(versionId ? { VersionId: versionId } : {})
      })
    );
    if (
      typeof result.ContentLength === "number" &&
      result.ContentLength > MAX_CHECKPOINT_BODY_BYTES
    ) {
      throw new Error("Audit checkpoint object exceeds the size bound.");
    }
    if (!result.Body?.transformToString) {
      throw new Error("Audit checkpoint object body is unavailable.");
    }
    const body = await result.Body.transformToString();
    if (Buffer.byteLength(body) > MAX_CHECKPOINT_BODY_BYTES) {
      throw new Error("Audit checkpoint object exceeds the size bound.");
    }
    return body;
  }

  return {
    /**
     * @param {{ key: string, body: string, retainUntil: Date }} input
     */
    async put({ key, body, retainUntil }) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: "application/json",
            IfNoneMatch: "*",
            ObjectLockMode: "COMPLIANCE",
            ObjectLockRetainUntilDate: retainUntil,
            ChecksumSHA256: createHash("sha256")
              .update(body)
              .digest("base64")
          })
        );
      } catch (error) {
        if (isPreconditionFailure(error)) {
          throw new AuditCheckpointExistsError();
        }
        throw error;
      }
    },
    get,
    async all() {
      /** @type {{ key: string, versionId: string }[]} */
      const versions = [];
      /** @type {string | undefined} */
      let keyMarker;
      /** @type {string | undefined} */
      let versionIdMarker;
      while (true) {
        const page = await client.send(
          new ListObjectVersionsCommand({
            Bucket: bucket,
            Prefix: CHECKPOINT_PREFIX,
            KeyMarker: keyMarker,
            VersionIdMarker: versionIdMarker
          })
        );
        const deleteMarkers =
          /** @type {{ Key?: unknown }[]} */ (page.DeleteMarkers ?? []);
        if (deleteMarkers.some(
          (marker) => typeof marker.Key === "string"
        )) {
          throw new Error(
            "Audit checkpoint delete marker hides retained history."
          );
        }
        for (const object of page.Versions ?? []) {
          if (
            typeof object.Key === "string" &&
            typeof object.VersionId === "string"
          ) {
            versions.push({
              key: object.Key,
              versionId: object.VersionId
            });
            if (versions.length > MAX_RETAINED_CHECKPOINTS) {
              throw new Error(
                "Retained audit checkpoint count exceeds the verifier bound."
              );
            }
          }
        }
        if (page.IsTruncated !== true) {
          break;
        }
        keyMarker = page.NextKeyMarker;
        versionIdMarker = page.NextVersionIdMarker;
        if (!keyMarker) {
          throw new Error(
            "Audit checkpoint version listing pagination is invalid."
          );
        }
      }
      versions.sort((left, right) =>
        left.key.localeCompare(right.key) ||
        left.versionId.localeCompare(right.versionId)
      );
      if (versions.length === 0) {
        throw new Error("No immutable audit checkpoint exists.");
      }
      /** @type {{ key: string, body: string }[]} */
      const objects = [];
      for (const version of versions) {
        objects.push({
          key: version.key,
          body: await get(version.key, version.versionId)
        });
      }
      return objects;
    }
  };
}

/** @param {unknown} error */
function isPreconditionFailure(error) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = /** @type {{ name?: unknown, $metadata?: { httpStatusCode?: unknown } }} */ (
    error
  );
  return (
    candidate.name === "PreconditionFailed" ||
    candidate.$metadata?.httpStatusCode === 412
  );
}
