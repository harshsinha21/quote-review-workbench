// Small read-only lookups over the derived review that more than one screen needs. Pure; no rules.

import type { FollowUpAsk, ProductReview, SourceDoc, VendorReview } from '../../domain/types';
import { formatShortDate } from './format';

/** A product the vendor declined: no lines at all, or the vendor's own text says no bid. */
export function isNoBid(productReview: ProductReview): boolean {
  return productReview.lines.length === 0 || productReview.source?.noBid === true;
}

/** The description of an RFQ item (the RFQ carries none), taken from the first exact-part quote any vendor gave. */
export function findItemDescription(vendors: readonly VendorReview[], rfqNo: number): string {
  for (const review of vendors) {
    const exactProduct = review.products.find((productReview) => productReview.rfqNo === rfqNo && productReview.kind === 'exact');
    if (exactProduct?.product.description) return exactProduct.product.description;
  }
  return '';
}

/** The follow-up asks still ticked for a vendor: the ones its email will contain. */
export function openAsks(review: VendorReview): FollowUpAsk[] {
  return (review.followUp.asks ?? []).filter((ask) => !ask.excluded);
}

/** Names a source document: "our RFQ, May 12", "apex-quote-Q-AC-44218.pdf, May 15", "Mike Henderson's email, May 14". */
export function describeSourceDoc(doc: SourceDoc): string {
  if (doc.role === 'rfq') return `our RFQ, ${formatShortDate(doc.date)}`;
  const name = doc.attachment ? doc.attachment.filename : `${doc.fromName || 'the vendor'}'s email`;
  return `${name}, ${formatShortDate(doc.date)}`;
}
