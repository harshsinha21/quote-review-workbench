// Wires the domain pipeline: per vendor parse, match, rules, open flags, coverage and follow-up; then compare and PO.
// Pure and deterministic: never mutates state or overlay, never reads the clock (time is overlay.settings.asOf), never throws.

import { buildCompare, buildPoPlan } from './compare';
import type { RuleContext } from './context';
import { buildFollowUp } from './followUp';
import { computeCoverage, reviewProducts } from './match';
import { createEmptyRfq } from './parseRfq';
import { parseVendorSource } from './parseSource';
import { runRules } from './rules';
import { addDaysIso } from './text';
import type {
  CompareRow, Flag, Overlay, PoPlan, ProductReview, RawState, RawVendor, ReviewModel, Severity, VendorReview,
} from './types';

/** Runs `compute` and returns `fallback` if it throws, so one bad input never takes the whole review down. */
function withFallback<T>(compute: () => T, fallback: T): T {
  try {
    return compute();
  } catch {
    return fallback;
  }
}

function countBySeverity(flags: Flag[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { blocker: 0, warning: 0, info: 0 };
  for (const flag of flags) {
    if (flag.severity in counts) counts[flag.severity] += 1;
  }
  return counts;
}

function vendorStatus(vendor: RawVendor, overlay: Overlay, canSubmit: boolean): VendorReview['status'] {
  if (overlay.submittedAt?.[vendor.id] || vendor.submittedAt) return 'submitted';
  return canSubmit ? 'ready' : 'needs-review';
}

/** respondedAt's date plus daysQuoteValid, as YYYY-MM-DD; undefined when either is missing. */
function validUntilOf(respondedAt: string, daysQuoteValid: number | null): string | undefined {
  if (!respondedAt || daysQuoteValid === null || daysQuoteValid === undefined) return undefined;
  return addDaysIso(respondedAt, daysQuoteValid) || undefined;
}

function reviewVendor(vendor: RawVendor, overlay: Overlay): VendorReview {
  const source = parseVendorSource(vendor);
  const { rfq } = source;
  const products = reviewProducts(vendor, rfq, source.items, overlay);
  const validUntil = validUntilOf(source.respondedAt, vendor.daysQuoteValid);
  const context: RuleContext = { vendor, rfq, source, products, settings: overlay.settings, validUntil };
  const flags: Flag[] = runRules(context);
  const open = flags.filter((flag) => overlay.decisions?.[flag.id] === undefined);
  const counts = countBySeverity(open);
  const canSubmit = counts.blocker === 0;
  return {
    vendor, rfq, docs: source.docs, products, flags, open, counts,
    coverage: computeCoverage(rfq, products),
    respondedAt: source.respondedAt, validUntil,
    expired: validUntil !== undefined && validUntil < overlay.settings.asOf,
    sourceLabel: source.sourceLabel,
    followUp: buildFollowUp(context, open, overlay.followUpExcluded ?? {}),
    canSubmit, status: vendorStatus(vendor, overlay, canSubmit), hasParsedSource: source.hasParsedSource,
  };
}

/** The review shown when a vendor could not be reviewed: no flags, nothing quoted, every line unverified. */
function unreviewableVendor(vendor: RawVendor, overlay: Overlay): VendorReview {
  const source = parseVendorSource(vendor);
  const { rfq } = source;
  const products = withFallback<ProductReview[]>(() => reviewProducts(vendor, createEmptyRfq(), [], overlay), []);
  return {
    vendor, rfq, docs: source.docs, products, flags: [], open: [], counts: { blocker: 0, warning: 0, info: 0 },
    coverage: computeCoverage(rfq, []),
    respondedAt: source.respondedAt, validUntil: undefined, expired: false, sourceLabel: source.sourceLabel,
    followUp: { generated: '', staleAsks: [], missedFlagIds: [], asks: [] },
    canSubmit: false, status: vendorStatus(vendor, overlay, false), hasParsedSource: false,
  };
}

function reviewVendorSafely(vendor: RawVendor, overlay: Overlay): VendorReview {
  try {
    return reviewVendor(vendor, overlay);
  } catch {
    return unreviewableVendor(vendor, overlay);
  }
}

/** Builds the whole review model from state.json and the overlay; pure, deterministic and never throws. */
export function buildReview(state: RawState, overlay: Overlay): ReviewModel {
  const rawVendors = Array.isArray(state?.vendors) ? state.vendors : [];
  const vendors = rawVendors
    .filter((vendor) => vendor !== null && typeof vendor === 'object')
    .map((vendor) => reviewVendorSafely(vendor, overlay));
  const rfq = vendors[0]?.rfq ?? createEmptyRfq();
  const compare = withFallback<CompareRow[]>(() => buildCompare(rfq, vendors, overlay.settings), []);
  const po = withFallback<PoPlan>(() => buildPoPlan(rfq, compare, vendors, overlay), { drafts: [], unsourced: [] });
  return { rfq, vendors, compare, po };
}
