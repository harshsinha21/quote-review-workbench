// Read-only selectors that shape the derived review for the Customer view: grouping, lookups, scoping issues to
// one price, and plain wording. Pure functions over the ReviewModel; they never run or re-run any rule.

import { ALTERNATE_BADGE, NON_US_COO_BADGE } from '../../domain/compare';
import type { CompareCell, CompareRow, Flag, ReviewModel, RfqItem, VendorReview } from '../../domain/types';
import type { CustomerIssueState } from '../shared/labels';
import { findItemDescription } from '../shared/reviewLookups';

/**
 * What the evidence drawer shows: one vendor's quote for one RFQ item and quantity break.
 * Keys only, so the drawer always reads the current model instead of a stale copy of the cell.
 */
export interface EvidenceTarget { vendorId: string; rfqNo: number; qty: number }

/** One RFQ item with its compare rows (one per requested break) and a description from an exact quote. */
export interface ItemGroup { item: RfqItem; description: string; rows: CompareRow[] }

/** The current row, cell and vendor review behind an evidence target. */
export interface ResolvedEvidence { row: CompareRow; cell: CompareCell; review: VendorReview }

/** A vendor's open issues around one price: those on the price itself, and the rest of its part or quote. */
export interface ScopedIssues { onThisPrice: Flag[]; elsewhere: Flag[] }

/** Customer wording for compare badges. EUR is dropped: the price already shows its currency. */
const CUSTOMER_BADGE_LABELS: Partial<Record<string, string | null>> = {
  [ALTERNATE_BADGE]: 'Alternate part number',
  EUR: null,
  [NON_US_COO_BADGE]: 'Made outside the US',
};

/** Groups the compare rows under their RFQ item, in RFQ order. */
export function groupRowsByItem(model: ReviewModel): ItemGroup[] {
  return model.rfq.items.map((item) => ({
    item,
    description: findItemDescription(model.vendors, item.no),
    rows: model.compare.filter((row) => row.rfqNo === item.no),
  }));
}

/** The quotes from every vendor except the recommended one, in vendor order; vendors with no quote are skipped. */
export function findOtherQuotes(row: CompareRow, vendorOrder: string[]): CompareCell[] {
  return vendorOrder
    .filter((vendorId) => vendorId !== row.bestVendorId)
    .flatMap((vendorId) => row.cells[vendorId] ?? []);
}

/** Looks up what an evidence target points at in the current model; undefined once it no longer exists. */
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

/** The quote validity that ends first (ISO dates compare as text), or undefined when no vendor stated one. */
export function findEarliestExpiry(vendors: VendorReview[]): { date: string; isExpired: boolean } | undefined {
  const withValidity = vendors.filter((review) => review.validUntil).sort((left, right) => (left.validUntil ?? '').localeCompare(right.validUntil ?? ''));
  const earliest = withValidity[0];
  return earliest?.validUntil ? { date: earliest.validUntil, isExpired: earliest.expired } : undefined;
}

/**
 * Splits a vendor's open issues for one price. On this price: issues on its line, plus part-wide issues on its
 * product that name no other quantity. Elsewhere: the part's other quantities and the whole quote.
 */
export function scopeIssues(review: VendorReview, cell: CompareCell, row: CompareRow): ScopedIssues {
  const isOnThisPrice = (flag: Flag) => flag.lineId === cell.lineId
    || (flag.lineId === undefined && flag.productId === cell.productId && (flag.qty === undefined || flag.qty === row.qty));
  const isAboutThisQuote = (flag: Flag) => flag.productId === cell.productId || flag.rfqNo === row.rfqNo
    || (flag.productId === undefined && flag.rfqNo === undefined);
  return {
    onThisPrice: review.open.filter(isOnThisPrice),
    elsewhere: review.open.filter((flag) => !isOnThisPrice(flag) && isAboutThisQuote(flag)),
  };
}

/** How the customer reads an issue: extraction slips are ours to correct; the rest waits on the vendor or is a note. */
export function customerIssueState(flag: Flag): CustomerIssueState {
  if (flag.category === 'extraction') return 'correcting';
  return flag.severity === 'info' ? 'note' : 'waiting';
}

/** Compare badges in customer wording ("Alternate part number"), with the currency badge dropped. */
export function describeBadges(badges: string[]): string[] {
  return badges.flatMap((badge) => {
    const label = CUSTOMER_BADGE_LABELS[badge];
    return label === null ? [] : [label ?? badge];
  });
}
