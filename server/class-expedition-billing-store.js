import { ClassroomAccessDeniedError } from "./classroom-context.js";
import { withTenantContext } from "./tenant-context.js";

/**
 * License lifecycle rides the SECURITY DEFINER functions from migration 0021.
 * Reserve validates inputs and enforces one open base License per Expedition;
 * activation and transitions are monotonic on the provider event timestamp,
 * so webhook replays and out-of-order deliveries cannot regress state.
 *
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * } & {
 *   connect?: () => Promise<{
 *     query: (
 *       sql: string,
 *       values?: unknown[]
 *     ) => Promise<{ rows: Record<string, unknown>[] }>,
 *     release: (destroy?: boolean) => void
 *   }>
 * }} pool
 */
export function createClassExpeditionBillingStore(pool) {
  return {
    /**
     * Reservation runs inside the sponsor's tenant transaction: the definer
     * verifies the transaction-local Teacher identity against the
     * Expedition's own Classroom, so a Teacher of one Classroom cannot
     * reserve a License against another Classroom's Expedition.
     *
     * @param {string} sponsorUserId
     * @param {{
     *   purchaseId: string,
     *   expeditionId: string,
     *   classroomId: string,
     *   kind: "base" | "extension",
     *   priceId: string
     * }} input
     */
    async reserveLicense(sponsorUserId, input) {
      const connectable =
        /** @type {Parameters<typeof withTenantContext>[0]} */ (pool);
      await withTenantContext(
        connectable,
        { explorerId: sponsorUserId, classroomId: input.classroomId },
        (database) =>
          database.query(
            "SELECT reserve_class_expedition_license($1, $2, $3, $4, $5)",
            [
              input.purchaseId,
              input.expeditionId,
              input.kind,
              sponsorUserId,
              input.priceId
            ]
          )
      );
      return true;
    },

    /**
     * @param {{
     *   purchaseId: string,
     *   checkoutSessionId: string,
     *   paymentIntentId: string,
     *   amount: number,
     *   currency: string,
     *   eventCreated: number
     * }} input
     */
    async activateLicense(input) {
      const result = await pool.query(
        "SELECT activate_class_expedition_license($1, $2, $3, $4, $5, $6) AS applied",
        [
          input.purchaseId,
          input.checkoutSessionId,
          input.paymentIntentId,
          input.amount,
          input.currency,
          input.eventCreated
        ]
      );
      return result.rows[0]?.applied === true;
    },

    /**
     * @param {string} purchaseId
     * @param {"paid" | "refunded" | "disputed" | "expired" | "failed"} status
     * @param {number} eventCreated
     */
    async transitionLicense(purchaseId, status, eventCreated) {
      const result = await pool.query(
        "SELECT transition_class_expedition_license($1, $2, $3) AS applied",
        [purchaseId, status, eventCreated]
      );
      return result.rows[0]?.applied === true;
    },

    /**
     * @param {string} userId
     * @param {string} classroomId
     * @param {string} expeditionId
     */
    async capacityForTeacher(userId, classroomId, expeditionId) {
      const connectable =
        /** @type {Parameters<typeof withTenantContext>[0]} */ (pool);
      const rows = await withTenantContext(
        connectable,
        { explorerId: userId, classroomId },
        async (database) => {
          const result = await database.query(
            "SELECT * FROM read_class_expedition_capacity($1)",
            [expeditionId]
          );
          return result.rows;
        }
      );
      const row = rows[0];
      if (!row) {
        throw new ClassroomAccessDeniedError();
      }
      return {
        seatsTotal: Number(row.seats_total),
        seatsAssigned: Number(row.seats_assigned),
        baseStatus: row.base_status === null ? null : String(row.base_status),
        extensionPaidCount: Number(row.extension_paid_count),
        baseRefundEligible: row.base_refund_eligible === true,
        extensionRefundEligibleCount: Number(
          row.extension_refund_eligible_count
        )
      };
    }
  };
}
