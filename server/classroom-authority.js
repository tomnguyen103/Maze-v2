/** @type {Map<string, "teacher" | "student">} */
const ROLE_MAP = new Map([
  ["org:admin", "teacher"],
  ["org:member", "student"]
]);

/**
 * @param {{
 *   upsertClassroom?: (value: {
 *     id: string,
 *     name: string,
 *     occurredAt: number
 *   }) => Promise<boolean>,
 *   deleteClassroom?: (value: {
 *     id: string,
 *     occurredAt: number
 *   }) => Promise<boolean>,
 *   upsertMembership?: (value: {
 *     id: string,
 *     classroomId: string,
 *     userId: string,
 *     role: "teacher" | "student",
 *     occurredAt: number
 *   }) => Promise<boolean>,
 *   deleteMembership?: (value: {
 *     id: string,
 *     occurredAt: number
 *   }) => Promise<boolean>
 * }} store
 * @param {{ eventType: string, payload: unknown }} event
 */
export async function processClassroomAuthorityEvent(store, event) {
  const payload = /** @type {Record<string, unknown>} */ (event.payload ?? {});
  switch (event.eventType) {
    case "organization.created":
    case "organization.updated": {
      const value = {
        id: requiredString(payload.id),
        name: requiredString(payload.name),
        occurredAt: requiredTimestamp(payload.occurredAt)
      };
      const applied = await store.upsertClassroom?.(value);
      return outcome(
        "classroom.sync",
        "classroom",
        value.id,
        applied === true
      );
    }
    case "organization.deleted": {
      const value = {
        id: requiredString(payload.id),
        occurredAt: requiredTimestamp(payload.occurredAt)
      };
      const applied = await store.deleteClassroom?.(value);
      return outcome(
        "classroom.delete",
        "classroom",
        value.id,
        applied === true
      );
    }
    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const clerkRole = requiredString(payload.role);
      const role = ROLE_MAP.get(clerkRole);
      if (!role) {
        const id = requiredString(payload.id);
        const applied = await store.deleteMembership?.({
          id,
          occurredAt: requiredTimestamp(payload.occurredAt)
        });
        return outcome(
          "classroom.membership.delete",
          "classroom_membership",
          id,
          applied === true
        );
      }
      const value = {
        id: requiredString(payload.id),
        classroomId: requiredString(payload.classroomId),
        userId: requiredString(payload.userId),
        role,
        occurredAt: requiredTimestamp(payload.occurredAt)
      };
      const applied = await store.upsertMembership?.(value);
      return outcome(
        "classroom.membership.sync",
        "classroom_membership",
        value.id,
        applied === true
      );
    }
    case "organizationMembership.deleted": {
      const value = {
        id: requiredString(payload.id),
        occurredAt: requiredTimestamp(payload.occurredAt)
      };
      const applied = await store.deleteMembership?.(value);
      return outcome(
        "classroom.membership.delete",
        "classroom_membership",
        value.id,
        applied === true
      );
    }
    default:
      return null;
  }
}

/**
 * @param {string} action
 * @param {string} type
 * @param {string} id
 * @param {boolean} applied
 */
function outcome(action, type, id, applied) {
  return { action, applied, resource: { type, id } };
}

/** @param {unknown} value */
function requiredString(value) {
  if (typeof value !== "string" || !value) {
    throw new Error("Clerk Classroom event is invalid.");
  }
  return value;
}

/** @param {unknown} value */
function requiredTimestamp(value) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error("Clerk Classroom event timestamp is invalid.");
  }
  return value;
}
