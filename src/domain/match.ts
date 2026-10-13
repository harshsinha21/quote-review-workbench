// Matches each extracted product to an RFQ item (exact, alternate or unrequested), applies the reviewer's line
// overrides to copies and pairs every line with its source line. Raises no flags; never mutates its inputs.

import { PRICE_TOLERANCE, UNIT_COST_TOLERANCE } from './constants';
import { escapeRegExp, normalizePartNumber } from './text';
import type {
  LineReview, MatchKind, Overlay, ProductReview, RawLine, RawProduct, RawVendor, Rfq, RfqItem, SourceItem,
  SourceLine, VendorReview,
} from './types';

/** One line's reviewer overrides, as stored in the overlay. */
export type LineOverride = Overlay['lineOverrides'][string];

/** Override fields that change a line's commercial values (an isQuoting override alone does not count). */
export const VALUE_OVERRIDE_FIELDS = ['unitCost', 'price', 'currency', 'leadTime', 'isFat'] as const;

/** Sort key that puts unrequested products (no rfqNo) after every requested one. */
const UNREQUESTED_SORT_KEY = Number.MAX_SAFE_INTEGER;

/** How one product relates to the RFQ, and the source block written for it. */
interface ProductMatch { kind: MatchKind; rfqNo?: number; source?: SourceItem }

/** Returns a copy of `line` with every defined override value applied. */
export function applyLineOverride(line: RawLine, override: LineOverride | undefined): RawLine {
  const applied: RawLine = { ...line };
  if (!override) return applied;
  if (override.unitCost !== undefined) applied.unitCost = override.unitCost;
  if (override.price !== undefined) applied.price = override.price;
  if (override.currency !== undefined) applied.currency = override.currency;
  if (override.leadTime !== undefined) applied.leadTime = override.leadTime;
  if (override.isFat !== undefined) applied.isFat = override.isFat;
  if (override.isQuoting !== undefined) applied.isQuoting = override.isQuoting;
  return applied;
}

/** Alternate when the source says "ALT for PN", the notes say "alternate ... for PN", or the NSN is the same. */
function isAlternateFor(product: RawProduct, source: SourceItem | undefined, rfqItem: RfqItem): boolean {
  const rfqPn = normalizePartNumber(rfqItem.partNumber);
  if (rfqPn === '' || normalizePartNumber(product.partNumber) === rfqPn) return false;
  if (source?.altFor !== undefined && normalizePartNumber(source.altFor) === rfqPn) return true;
  const notesPattern = new RegExp(`alternate.*?for\\s+${escapeRegExp(rfqItem.partNumber)}(?![\\w-])`, 'i');
  if (notesPattern.test(String(product.additionalNotes ?? ''))) return true;
  const productNsn = String(product.nsn ?? '').trim();
  return productNsn !== '' && productNsn === String(rfqItem.nsn ?? '').trim();
}

function matchProduct(product: RawProduct, rfq: Rfq, items: SourceItem[]): ProductMatch {
  const productPn = normalizePartNumber(product.partNumber);
  const source = items.find((item) => normalizePartNumber(item.partNumber) === productPn);
  const exactItem = rfq.items.find((item) => normalizePartNumber(item.partNumber) === productPn);
  if (productPn !== '' && exactItem) return { kind: 'exact', rfqNo: exactItem.no, source };
  const alternateItem = rfq.items.find((item) => isAlternateFor(product, source, item));
  if (alternateItem) return { kind: 'alternate', rfqNo: alternateItem.no, source };
  return { kind: 'unrequested', source };
}

/** Verified when every commercial value equals the source line; unverified when there is no source line. */
function lineStatus(line: RawLine, source: SourceLine | undefined): LineReview['status'] {
  if (!source) return 'unverified';
  const matchesSource = line.unitCost !== null && Math.abs(line.unitCost - source.unitCost) <= UNIT_COST_TOLERANCE
    && line.price !== null && Math.abs(line.price - source.price) <= PRICE_TOLERANCE
    && line.currency === source.currency && line.leadTime === source.leadTime
    && (line.isFat ?? false) === source.isFat;
  return matchesSource ? 'verified' : 'flagged';
}

function reviewLine(line: RawLine, kind: MatchKind, source: SourceItem | undefined,
  override: LineOverride | undefined): LineReview {
  const effectiveLine = applyLineOverride(line, override);
  const quotingOverride = override?.isQuoting;
  const included = quotingOverride !== undefined ? quotingOverride : kind !== 'unrequested' && Boolean(line.isQuoting);
  const sourceLine = source?.lines.find((candidate) => candidate.qty === line.quantity);
  const overridden = override !== undefined && VALUE_OVERRIDE_FIELDS.some((field) => override[field] !== undefined);
  return { line: effectiveLine, included, source: sourceLine, overridden, status: lineStatus(effectiveLine, sourceLine) };
}

function reviewProduct(product: RawProduct, rfq: Rfq, items: SourceItem[], overlay: Overlay): ProductReview {
  const { kind, rfqNo, source } = matchProduct(product, rfq, items);
  const lines = product.lines.map((line) => reviewLine(line, kind, source, overlay.lineOverrides?.[line.id]));
  return { product, kind, rfqNo, source, lines };
}

/** Matches every product, applies overrides to copies and pairs lines with sources; ordered by rfqNo, then unrequested. */
export function reviewProducts(vendor: RawVendor, rfq: Rfq, items: SourceItem[], overlay: Overlay): ProductReview[] {
  const products = Array.isArray(vendor.products) ? structuredClone(vendor.products) : [];
  const reviews = products
    .filter((product) => product !== null && typeof product === 'object')
    .map((product) => {
      if (!Array.isArray(product.lines)) product.lines = [];
      return reviewProduct(product, rfq, items, overlay);
    });
  return reviews.sort((left, right) => (left.rfqNo ?? UNREQUESTED_SORT_KEY) - (right.rfqNo ?? UNREQUESTED_SORT_KEY));
}

/**
 * Quantities the vendor quoted for one RFQ item: every line of its exact and alternate products, whether or not
 * the reviewer includes that line in the award (excluding a part must never read as "the vendor did not quote it").
 */
export function quotedQuantities(products: ProductReview[], rfqNo: number): Set<number> {
  const quantities = new Set<number>();
  for (const productReview of products) {
    if (productReview.kind === 'unrequested' || productReview.rfqNo !== rfqNo) continue;
    for (const lineReview of productReview.lines) {
      quantities.add(lineReview.line.quantity);
    }
  }
  return quantities;
}

/** Parts and requested quantity breaks this vendor quoted, against the RFQ totals. */
export function computeCoverage(rfq: Rfq, products: ProductReview[]): VendorReview['coverage'] {
  let partsQuoted = 0;
  let breaksQuoted = 0;
  let breaks = 0;
  for (const rfqItem of rfq.items) {
    const quoted = quotedQuantities(products, rfqItem.no);
    breaks += rfqItem.qtys.length;
    breaksQuoted += rfqItem.qtys.filter((qty) => quoted.has(qty)).length;
    if (quoted.size > 0) partsQuoted += 1;
  }
  return { partsQuoted, parts: rfq.items.length, breaksQuoted, breaks };
}
