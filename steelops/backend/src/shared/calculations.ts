// Pure calculation helpers pulled out of route/job handlers so they can be
// unit tested without a database. Behaviour is unchanged from the inline
// versions that used to live in scoring.ts / sales.routes.ts / shared.routes.ts —
// only the location moved.

export type PerfTier = 'top' | 'mid' | 'poor';

/**
 * Weekly sales score: up to 60 points for contact volume (capped at 20 contacts),
 * plus up to 40 points for conversion rate (closed / total).
 */
export function computeSalesScore(totalContacts: number, closedDeals: number): { score: number; tier: PerfTier } {
  const volumeComponent = Math.min(totalContacts / 20, 1) * 60;
  const conversionComponent = totalContacts > 0 ? (closedDeals / totalContacts) * 40 : 0;
  const score = Math.round((volumeComponent + conversionComponent) * 10) / 10;
  const tier: PerfTier = score >= 80 ? 'top' : score >= 50 ? 'mid' : 'poor';
  return { score, tier };
}

/** 2% sales commission on a quote's total value. */
export function computeCommission(quantityTonnes: number, pricePerTonne: number): number {
  return quantityTonnes * pricePerTonne * 0.02;
}

/** 1% DDU insurance reserve on a PO's total value. */
export function computeDDUInsurance(quantityTonnes: number, pricePerTonne: number): number {
  return quantityTonnes * pricePerTonne * 0.01;
}

/**
 * Port unloading charge: billed at rate_per_hour for the full duration, with
 * anything past 8 hours flagged as overtime (billing itself doesn't change —
 * overtime is informational and drives the port.hour_8_overtime alert).
 */
export function computePortCharge(hoursElapsed: number, ratePerHour: number): { totalCharge: number; overtimeHours: number } {
  const overtimeHours = Math.max(0, hoursElapsed - 8);
  const totalCharge = ratePerHour * hoursElapsed;
  return { totalCharge, overtimeHours };
}
