const EVENT_FIELDS = {
  run_access_decision: [
    "accessState",
    "duplicate",
    "enforcementEnabled",
    "outcome"
  ],
  run_access_error: ["category"]
};

/**
 * @param {{ write?: (event: Record<string, unknown>) => void }} [dependencies]
 */
export function createProductEventRecorder({
  write = (event) => console.info(`[product] ${JSON.stringify(event)}`)
} = {}) {
  /**
   * @param {string} eventName
   * @param {Record<string, unknown>} fields
   */
  return function recordProductEvent(eventName, fields) {
    const allowedFields =
      EVENT_FIELDS[/** @type {keyof typeof EVENT_FIELDS} */ (eventName)];
    if (!allowedFields) {
      return;
    }
    /** @type {Record<string, unknown>} */
    const event = { event: eventName };
    for (const field of allowedFields) {
      if (Object.hasOwn(fields, field)) {
        event[field] = fields[field];
      }
    }
    write(event);
  };
}

export const recordProductEvent = createProductEventRecorder();
