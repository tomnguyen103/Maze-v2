/**
 * Unit economics in exact integer cents. Every input is a per-purchase or
 * per-period cost the owner reads from a provider statement, so the module
 * rejects a fraction or a negative value instead of rounding it.
 */

/**
 * @param {Record<string, number>} values
 */
function assertCents(values) {
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative integer of cents.`);
    }
  }
}

/**
 * The Contribution of one purchase: the gross price less the payment fee, the
 * expected refund loss, the per-purchase service cost and the provision.
 *
 * @param {{
 *   grossCents: number,
 *   feeCents: number,
 *   refundLossCents: number,
 *   serviceCents: number,
 *   provisionCents: number
 * }} purchase
 * @returns {number} The Contribution in cents. It can be zero or negative.
 */
export function contributionCents(purchase) {
  const { grossCents, feeCents, refundLossCents, serviceCents, provisionCents } =
    purchase;
  assertCents({ grossCents, feeCents, refundLossCents, serviceCents, provisionCents });
  const result =
    grossCents - feeCents - refundLossCents - serviceCents - provisionCents;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("The Contribution is outside the exact integer range.");
  }
  return result;
}

/**
 * The count of purchases that pays a fixed cost. No count pays it when each
 * purchase contributes nothing, so the result is then `null`.
 *
 * @param {{ fixedCents: number, contributionCents: number }} period
 * @returns {number | null}
 */
export function breakEvenPurchases({ fixedCents, contributionCents }) {
  assertCents({ fixedCents });
  if (!Number.isSafeInteger(contributionCents)) {
    throw new RangeError("contributionCents must be an integer of cents.");
  }
  if (contributionCents <= 0) {
    return null;
  }
  return Math.ceil(fixedCents / contributionCents);
}
