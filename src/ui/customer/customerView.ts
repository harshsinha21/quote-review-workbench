// Read-only selectors that shape the derived review for the Customer view: grouping, lookups and
// plain wording. Pure functions over the ReviewModel; they never run or re-run any rule.

import { SEVERITY_ORDER } from '../../domain/constants';
import type { CompareCell, CompareRow, Flag, ReviewModel, RfqItem, VendorReview } from '../../domain/types';

/**
 * What the evidence drawer shows: one vendor's quote for one RFQ item and quantity break.
 * Keys only, so the drawer always reads the current model instead of a stale copy of the cell.
 */
export interface EvidenceTarget { vendorId: string; rfqNo: number; qty: number }

/** One RFQ item with its compare rows (one per requested break) and a description from an exact quote. */
export interface ItemGroup { item: RfqItem; description?: string; rows: CompareRow[] }

/** The vendor whose quote validity ends first, for the expiry KPI. */
export interface EarliestExpiry { date: string; vendorName: string; isExpired: boolean }

/** A vendor's open issues that bear on one quoted part, split by scope, most severe first. */
export interface OpenIssues { partIssues: Flag[]; quoteIssues: Flag[] }

/** The current row, cell and vendor review behind an evidence target. */
export interface ResolvedEvidence { row: CompareRow; cell: CompareCell; review: VendorReview }

/**
 * Customer wording for compare badges. EUR maps to null (dropped) because the price already shows
 * the quoted currency next to its USD value. Unknown badges pass through unchanged.
 */
const CUSTOMER_BADGE_LABELS: Partial<Record<string, string | null>> = {
  ALT: 'Alternate part number',
  EUR: null,
  'non-US COO': 'Made outside the US',
};

/**
 * Groups the compare rows under their RFQ item, in RFQ order.
 * @param model the derived review
 * @returns one group per RFQ item; an item with no rows gets an empty list
 */
export function groupRowsByItem(model: ReviewModel): ItemGroup[] {
  return model.rfq.items.map((item) => ({
    item,
    description: findItemDescription(model.vendors, item.no),
    rows: model.compare.filter((row) => row.rfqNo === item.no),
  }));
}

/** The first description an exact-PN quote gives for an RFQ item (the RFQ itself carries none). */
function findItemDescription(vendors: VendorReview[], rfqNo: number): string | undefined {
  for (const review of vendors) {
    const exactProduct = review.products.find((candidate) => candidate.rfqNo === rfqNo && candidate.kind === 'exact');
    if (exactProduct?.product.description) return exactProduct.product.description;
  }
  return undefined;
}

/**
 * The quotes from every vendor except the recommended one, in vendor order.
 * Vendors that did not quote this break are skipped.
 */
export function findOtherQuotes(row: CompareRow, vendorOrder: string[]): CompareCell[] {
  return vendorOrder
    .filter((vendorId) => vendorId !== row.bestVendorId)
    .map((vendorId) => row.cells[vendorId])
    .filter((cell): cell is CompareCell => cell !== undefined);
}

/**
 * Looks up what an evidence target points at in the current model.
 * @returns undefined when there is no target, or the row, cell or vendor no longer exists
 */
export function resolveEvidence(model: ReviewModel, target: EvidenceTarget | undefined): ResolvedEvidence | undefined {
  if (!target) return undefined;
  const row = model.compare.find((candidate) => candidate.rfqNo === target.rfqNo && candidate.qty === target.qty);
  const cell = row?.cells[target.vendorId];
  const review = model.vendors.find((candidate) => candidate.vendor.id === target.vendorId);
  return row && cell && review ? { row, cell, review } : undefined;
}

/** True when the target points at this vendor's quote for this row (used to tint the open row). */
export function isSameTarget(target: EvidenceTarget | undefined, row: CompareRow, vendorId: string): boolean {
  return target?.rfqNo === row.rfqNo && target.qty === row.qty && target.vendorId === vendorId;
}

/**
 * The quote that expires first. Dates are ISO strings, so they compare as text.
 * @returns undefined when no vendor stated a validity
 */
export function findEarliestExpiry(vendors: VendorReview[]): EarliestExpiry | undefined {
  let earliest: { date: string; review: VendorReview } | undefined;
  for (const review of vendors) {
    if (review.validUntil && (!earliest || review.validUntil < earliest.date)) {
      earliest = { date: review.validUntil, review };
    }
  }
  if (!earliest) return undefined;
  return { date: earliest.date, vendorName: earliest.review.vendor.name, isExpired: earliest.review.expired };
}

/**
 * A vendor's open issues for one quoted part: flags on that product (or on its RFQ item with no
 * product), and vendor-wide flags, which also hold back every price in the quote.
 */
export function findOpenIssues(review: VendorReview, productId: string, rfqNo: number): OpenIssues {
  const isPartIssue = (flag: Flag) =>
    flag.productId === productId || (flag.productId === undefined && flag.rfqNo === rfqNo);
  const isQuoteIssue = (flag: Flag) => flag.productId === undefined && flag.rfqNo === undefined;
  return {
    partIssues: review.open.filter(isPartIssue).sort(bySeverity),
    quoteIssues: review.open.filter(isQuoteIssue).sort(bySeverity),
  };
}

/** Sort comparator: blockers, then warnings, then info. */
function bySeverity(first: Flag, second: Flag): number {
  return SEVERITY_ORDER.indexOf(first.severity) - SEVERITY_ORDER.indexOf(second.severity);
}

/** Compare badges in customer wording ("Alternate part number"), with the currency badge dropped. */
export function describeBadges(badges: string[]): string[] {
  return badges.flatMap((badge) => {
    const label = CUSTOMER_BADGE_LABELS[badge];
    if (label === null) return [];
    return [label ?? badge];
  });
}

/** "18 days", "1 day", or "n/a" when the vendor gave no lead time. */
export function formatLeadTime(leadTime: number | null): string {
  if (leadTime === null) return 'n/a';
  return `${leadTime} ${leadTime === 1 ? 'day' : 'days'}`;
}
