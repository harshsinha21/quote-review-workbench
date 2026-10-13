// Builds the cross-vendor comparison (one row per RFQ item and requested qty) and the draft PO plan (section 5.8).
// Pure: reads reviews, settings and the overlay only, never mutates them. Unit prices keep sub-cent precision; totals are cents.

import { BASE_CURRENCY, DOMESTIC_COO } from './constants';
import { parseMinimumOrder } from './rules';
import { currencyCode, isKnownNumber, textOf } from './text';
import type {
  CompareCell, CompareRow, Flag, LineReview, MatchKind, Overlay, PoDraft, PoLine, PoPlan, ProductReview, Rfq, RfqItem,
  Trust, VendorReview,
} from './types';

/** Badge on a cell whose part is an alternate, not the requested PN. */
export const ALTERNATE_BADGE = 'ALT';
/** Badge on a cell whose part is made outside the US (Buy American / DFARS review). */
export const NON_US_COO_BADGE = 'non-US COO';

/** Product kinds that can fill a cell, exact first so a vendor's exact offer wins over its alternate. */
const OFFER_KINDS: readonly MatchKind[] = ['exact', 'alternate'];

const roundCents = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;
const roundUnitPrice = (amount: number): number => Math.round(amount * 10000) / 10000;

/** USD per unit of `currency`: 1 for USD (or none stated), eurUsd for EUR, null for a currency with no rate. */
function usdRate(currency: string, eurUsd: number): number | null {
  const code = currencyCode(currency);
  if (code === '' || code === BASE_CURRENCY) return 1;
  if (code === 'EUR') return isKnownNumber(eurUsd) && eurUsd > 0 ? eurUsd : null;
  return null;
}

/** Whether an open flag blocks a cell: a blocker on this line, on this product (no lineId), or vendor-level. */
function blocksCell(flag: Flag, productId: string, lineId: string): boolean {
  if (flag.severity !== 'blocker') return false;
  if (flag.lineId !== undefined) return flag.lineId === lineId;
  if (flag.productId !== undefined) return flag.productId === productId;
  return flag.rfqNo === undefined;
}

function trustOf(lineReview: LineReview, hasOpenBlocker: boolean): Trust {
  if (hasOpenBlocker) return 'open-issue';
  if (lineReview.overridden) return 'corrected';
  return lineReview.status === 'verified' ? 'verified' : 'unverified';
}

function badgesFor(productReview: ProductReview, currency: string): string[] {
  const badges: string[] = [];
  if (productReview.kind === 'alternate') badges.push(ALTERNATE_BADGE);
  const code = currencyCode(currency);
  if (code !== '' && code !== BASE_CURRENCY) badges.push(code);
  const coo = textOf(productReview.product.coo).trim().toUpperCase();
  if (coo !== '' && coo !== DOMESTIC_COO) badges.push(NON_US_COO_BADGE);
  return badges;
}

/** The included line at `qty` of the vendor's exact (else alternate) product for an RFQ item. */
function findOfferedLine(review: VendorReview, rfqNo: number, qty: number):
  { productReview: ProductReview; lineReview: LineReview } | undefined {
  for (const kind of OFFER_KINDS) {
    for (const productReview of review.products) {
      if (productReview.kind !== kind || productReview.rfqNo !== rfqNo) continue;
      const lineReview = productReview.lines.find((candidate) => candidate.included && candidate.line.quantity === qty);
      if (lineReview) return { productReview, lineReview };
    }
  }
  return undefined;
}

function buildCell(review: VendorReview, rfqNo: number, qty: number, settings: Overlay['settings']): CompareCell | undefined {
  const offered = findOfferedLine(review, rfqNo, qty);
  if (!offered) return undefined;
  const { productReview, lineReview } = offered;
  const { line } = lineReview;
  const rate = usdRate(line.currency, settings.eurUsd);
  const usd = isKnownNumber(line.unitCost) && rate !== null ? roundUnitPrice(line.unitCost * rate) : null;
  const hasOpenBlocker = review.open.some((flag) => blocksCell(flag, productReview.product.id, line.id));
  return {
    vendorId: review.vendor.id, productId: productReview.product.id, lineId: line.id, kind: productReview.kind,
    currency: line.currency, unitCost: line.unitCost, usd, leadTime: line.leadTime,
    eligible: productReview.kind === 'exact' && usd !== null && !hasOpenBlocker,
    trust: trustOf(lineReview, hasOpenBlocker),
    evidence: lineReview.source?.span,
    badges: badgesFor(productReview, line.currency),
  };
}

/** The eligible cell with the lowest usd; the earlier vendor wins a tie. */
function pickBestVendor(cells: Record<string, CompareCell | undefined>): string | undefined {
  let best: CompareCell | undefined;
  for (const cell of Object.values(cells)) {
    if (!cell?.eligible || cell.usd === null) continue;
    if (best === undefined || best.usd === null || cell.usd < best.usd) best = cell;
  }
  return best?.vendorId;
}

function sortedItems(rfq: Rfq): RfqItem[] {
  return [...rfq.items].sort((left, right) => left.no - right.no);
}

/** One row per RFQ item and requested qty (by item, then qty), one cell per vendor that quotes it. */
export function buildCompare(rfq: Rfq, vendors: VendorReview[], settings: Overlay['settings']): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const rfqItem of sortedItems(rfq)) {
    for (const qty of [...new Set(rfqItem.qtys)].sort((left, right) => left - right)) {
      const cells: Record<string, CompareCell | undefined> = {};
      for (const review of vendors) {
        const cell = buildCell(review, rfqItem.no, qty, settings);
        if (cell) cells[review.vendor.id] = cell;
      }
      rows.push({ rfqNo: rfqItem.no, partNumber: rfqItem.partNumber, qty, cells, bestVendorId: pickBestVendor(cells) });
    }
  }
  return rows;
}

/** The PO quantity of an item: the reviewer's choice, else the lowest requested qty. */
function chosenQuantity(rfqItem: RfqItem, overlay: Overlay): number {
  const chosen = overlay.poQuantity?.[rfqItem.no];
  if (isKnownNumber(chosen) && chosen > 0) return chosen;
  return rfqItem.qtys.length > 0 ? Math.min(...rfqItem.qtys) : 0;
}

function buildDraft(review: VendorReview, lines: PoLine[], eurUsd: number): PoDraft {
  const currency = textOf(lines[0]?.currency).trim() || BASE_CURRENCY;
  const orderedLineIds = new Set(lines.map((poLine) => poLine.lineId));
  const oneTimeCharges = review.products.flatMap((productReview) => {
    const nre = productReview.product.nreCost;
    const isOrdered = productReview.lines.some((lineReview) => orderedLineIds.has(lineReview.line.id));
    return isOrdered && isKnownNumber(nre) && nre > 0
      ? [{ label: `NRE ${productReview.product.partNumber}`, amount: roundCents(nre) }] : [];
  });
  const partsTotal = roundCents(lines.reduce((total, poLine) => total + poLine.extended, 0));
  const chargesTotal = oneTimeCharges.reduce((total, charge) => total + charge.amount, 0);
  const partsUsd = lines.reduce((total, poLine) => total + poLine.extended * (usdRate(poLine.currency, eurUsd) ?? 1), 0);
  const subtotalUsd = roundCents(partsUsd + chargesTotal * (usdRate(currency, eurUsd) ?? 1));
  const minimumOrderUsd = parseMinimumOrder(review.vendor.additionalNotes);
  return {
    vendorId: review.vendor.id, currency, lines, oneTimeCharges, partsTotal,
    subtotal: roundCents(partsTotal + chargesTotal), subtotalUsd, minimumOrderUsd,
    isBelowMinimum: minimumOrderUsd !== undefined && subtotalUsd < minimumOrderUsd,
    paymentTerms: textOf(review.vendor.paymentTerms),
  };
}

/** One draft PO per winning vendor at the chosen quantities, plus the items no vendor can supply yet. */
export function buildPoPlan(rfq: Rfq, compare: CompareRow[], vendors: VendorReview[], overlay: Overlay): PoPlan {
  const linesByVendor = new Map<string, PoLine[]>();
  const unsourced: PoPlan['unsourced'] = [];
  for (const rfqItem of sortedItems(rfq)) {
    const qty = chosenQuantity(rfqItem, overlay);
    const row = compare.find((candidate) => candidate.rfqNo === rfqItem.no && candidate.qty === qty);
    const cell = row?.bestVendorId === undefined ? undefined : row.cells[row.bestVendorId];
    if (!cell || !isKnownNumber(cell.unitCost)) {
      unsourced.push({ rfqNo: rfqItem.no, partNumber: rfqItem.partNumber, qty });
      continue;
    }
    const poLine: PoLine = {
      rfqNo: rfqItem.no, partNumber: rfqItem.partNumber, lineId: cell.lineId, qty, unitCost: cell.unitCost,
      currency: cell.currency, extended: roundCents(qty * cell.unitCost), leadTime: cell.leadTime ?? 0,
    };
    linesByVendor.set(cell.vendorId, [...(linesByVendor.get(cell.vendorId) ?? []), poLine]);
  }
  const drafts = vendors.flatMap((review) => {
    const lines = linesByVendor.get(review.vendor.id);
    return lines ? [buildDraft(review, lines, overlay.settings.eurUsd)] : [];
  });
  return { drafts, unsourced };
}
