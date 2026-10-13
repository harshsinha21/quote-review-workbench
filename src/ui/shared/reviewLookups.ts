// Small read-only lookups over the derived review that more than one screen needs. Pure; no rules.

import type { VendorReview } from '../../domain/types';

/** The description of an RFQ item (the RFQ carries none), taken from the first exact-part quote any vendor gave. */
export function findItemDescription(vendors: readonly VendorReview[], rfqNo: number): string {
  for (const review of vendors) {
    const exactProduct = review.products.find((productReview) => productReview.rfqNo === rfqNo && productReview.kind === 'exact');
    if (exactProduct?.product.description) return exactProduct.product.description;
  }
  return '';
}
