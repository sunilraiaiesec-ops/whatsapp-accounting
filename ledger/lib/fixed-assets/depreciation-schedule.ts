import { Prisma, type DepreciationMethod, type DepreciationScheduleStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Pure depreciation-schedule math — no DB access. buildSchedule() is the one
// extension point for future methods (sum-of-years-digits, units-of-
// production): add a case here and a matching DepreciationMethod enum value.
//
// Every schedule is generated once, in full, at asset-creation time (see
// lib/fixed-assets/assets.ts#createFixedAsset) and is never recomputed after
// that — posting only ever flips a period's status.
// ---------------------------------------------------------------------------

export type ScheduleInput = {
  cost: bigint;
  salvage: bigint;
  usefulLifeMonths: number;
  placedInServiceDate: Date;
  // Declining balance only. Defaults to double-declining
  // (200 / usefulLifeYears) when omitted.
  ratePercent?: number | null;
};

export type SchedulePeriod = {
  periodStart: Date;
  periodEnd: Date;
  depreciationAmount: bigint;
  accumulatedDepreciationAfter: bigint;
  bookValueAfter: bigint;
  status: DepreciationScheduleStatus;
};

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

// Last calendar day of the month containing `date` (day 0 of next month).
function endOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function validateCommon(input: ScheduleInput): void {
  if (input.usefulLifeMonths <= 0) {
    throw new Error("usefulLifeMonths must be positive");
  }
  if (input.salvage < 0n) {
    throw new Error("salvage value must not be negative");
  }
  if (input.salvage > input.cost) {
    throw new Error("salvage value cannot exceed cost");
  }
}

// depreciableAmount = cost - salvage; every period gets an equal monthly
// share except the last, which absorbs the flooring remainder so accumulated
// depreciation lands exactly on depreciableAmount — book value never dips
// below salvage and never leaves a rounding residue.
export function buildStraightLineSchedule(input: ScheduleInput): SchedulePeriod[] {
  validateCommon(input);
  const { cost, salvage, usefulLifeMonths, placedInServiceDate } = input;
  const depreciable = cost - salvage;
  const monthly = depreciable / BigInt(usefulLifeMonths); // BigInt division floors (non-negative)

  const start = startOfUtcMonth(placedInServiceDate);
  const periods: SchedulePeriod[] = [];
  let accumulated = 0n;

  for (let i = 0; i < usefulLifeMonths; i++) {
    const isLast = i === usefulLifeMonths - 1;
    const amount = isLast ? depreciable - accumulated : monthly;
    accumulated += amount;
    const periodStart = addMonthsUtc(start, i);
    periods.push({
      periodStart,
      periodEnd: endOfUtcMonth(periodStart),
      depreciationAmount: amount,
      accumulatedDepreciationAfter: accumulated,
      bookValueAfter: cost - accumulated,
      status: amount > 0n ? "SCHEDULED" : "SKIPPED",
    });
  }

  return periods;
}

// Each period depreciates bookValueBefore * monthlyRate, clamped so book
// value never dips below salvage. Once book value reaches salvage, remaining
// periods are generated as SKIPPED with a zero amount (never SCHEDULED) so
// the poster never has to reject a zero-amount period. The final period
// force-absorbs any residual down to salvage, same as straight-line.
export function buildDecliningBalanceSchedule(input: ScheduleInput): SchedulePeriod[] {
  validateCommon(input);
  const { cost, salvage, usefulLifeMonths, placedInServiceDate } = input;

  const usefulLifeYears = usefulLifeMonths / 12;
  const annualRatePercent =
    input.ratePercent ?? (usefulLifeYears > 0 ? 200 / usefulLifeYears : 0);
  const monthlyRate = new Prisma.Decimal(annualRatePercent).div(100).div(12);

  const start = startOfUtcMonth(placedInServiceDate);
  const periods: SchedulePeriod[] = [];
  let accumulated = 0n;
  let bookValue = cost;

  for (let i = 0; i < usefulLifeMonths; i++) {
    const isLast = i === usefulLifeMonths - 1;
    const remaining = bookValue - salvage;

    let amount: bigint;
    if (remaining <= 0n) {
      amount = 0n;
    } else if (isLast) {
      amount = remaining;
    } else {
      const computed = new Prisma.Decimal(bookValue.toString()).times(monthlyRate).floor();
      const computedAmount = BigInt(computed.toFixed(0));
      amount = computedAmount > remaining ? remaining : computedAmount;
    }

    accumulated += amount;
    bookValue -= amount;
    const periodStart = addMonthsUtc(start, i);
    periods.push({
      periodStart,
      periodEnd: endOfUtcMonth(periodStart),
      depreciationAmount: amount,
      accumulatedDepreciationAfter: accumulated,
      bookValueAfter: bookValue,
      status: amount > 0n ? "SCHEDULED" : "SKIPPED",
    });
  }

  return periods;
}

export function buildSchedule(
  method: DepreciationMethod,
  input: ScheduleInput,
): SchedulePeriod[] {
  switch (method) {
    case "STRAIGHT_LINE":
      return buildStraightLineSchedule(input);
    case "DECLINING_BALANCE":
      return buildDecliningBalanceSchedule(input);
    default: {
      const exhaustive: never = method;
      throw new Error(`Unsupported depreciation method: ${String(exhaustive)}`);
    }
  }
}
