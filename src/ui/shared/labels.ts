// Human-readable words for domain codes: Ops labels, plain-language customer wording, trust and roles.
// Data only. The domain never imports this file; views do.

import type { DocRole, MatchKind, RuleId, Severity } from '../../domain/types';
import type { TrustState } from './primitives';

/** Severity words shown next to their icon. */
export const SEVERITY_LABELS: Record<Severity, string> = { blocker: 'Blocker', warning: 'Warning', info: 'Info' };

/** Trust chip wording, shared by Ops and Customer views. */
export const TRUST_LABELS: Record<TrustState, string> = {
  verified: 'Verified against email',
  corrected: 'Corrected from email',
  'open-issue': 'Open issue',
  unverified: 'Unverified',
  'no-source': 'No compliant source',
};

/** Short Ops group label per rule, used in the issues panel ("Non-US origin (7)"). */
export const RULE_LABELS: Record<RuleId, string> = {
  EXTRACTION_DROPPED_VALUE: 'Dropped value',
  EXTRACTION_VALUE_MISMATCH: 'Value differs from email',
  EXTRACTION_FAT_MISMATCH: 'FAT flag differs from email',
  EXTRACTION_NOBID_INVENTED_FIELDS: 'Invented fields on a no-bid',
  EXTRACTION_FIELD_MISMATCH: 'Product field differs from email',
  EXTRACTION_STRUCTURE: 'Extraction structure',
  NO_BID: 'No bid',
  MISSING_QTY_BREAK: 'Missing qty break',
  EXTRA_QTY_BREAK: 'Unrequested qty break',
  ALTERNATE_OFFERED: 'Alternate offered',
  UNREQUESTED_PART: 'Unrequested part',
  LOOKALIKE_PART: 'Lookalike part',
  NSN_MISMATCH: 'NSN mismatch',
  MISSING_PRICE: 'Missing price',
  EXT_PRICE_MISMATCH: 'Extended price mismatch',
  NON_USD_CURRENCY: 'Non-USD currency',
  NRE_CHARGE: 'NRE charge',
  PREPAY_TERMS: 'Prepay terms',
  MIN_ORDER: 'Minimum order',
  QUOTE_EXPIRED: 'Quote expired',
  VALIDITY_AMBIGUOUS: 'Ambiguous validity',
  MISSING_HEADER_FIELD: 'Missing header field',
  MISSING_COO: 'Missing country of origin',
  NON_US_COO: 'Non-US origin',
  NO_CERT: 'No certification',
  HAZMAT: 'Hazmat',
  SURPLUS_SOURCE: 'Surplus source',
  MISSING_REQUIRED_FIELD: 'Missing required field',
};

/** Plain-language issue wording for the Customer view: no rule ids, no extraction internals. */
export const CUSTOMER_RULE_LABELS: Record<RuleId, string> = {
  EXTRACTION_DROPPED_VALUE: 'A price was missing in our capture; it is being corrected from the vendor email',
  EXTRACTION_VALUE_MISMATCH: 'A captured value differs from the vendor email and is being corrected',
  EXTRACTION_FAT_MISMATCH: 'First-article test status is being confirmed against the vendor email',
  EXTRACTION_NOBID_INVENTED_FIELDS: 'Product details on a no-bid line are being cleaned up',
  EXTRACTION_FIELD_MISMATCH: 'A product detail is being confirmed against the vendor email',
  EXTRACTION_STRUCTURE: 'The quote layout is being checked against the vendor email',
  NO_BID: 'The vendor did not bid this part',
  MISSING_QTY_BREAK: 'The vendor has not priced every requested quantity',
  EXTRA_QTY_BREAK: 'The vendor priced an extra quantity',
  ALTERNATE_OFFERED: 'The vendor offered an alternate part number',
  UNREQUESTED_PART: 'The vendor added a part that was not requested',
  LOOKALIKE_PART: 'An added part looks similar to a requested one',
  NSN_MISMATCH: 'The NSN needs confirmation',
  MISSING_PRICE: 'Price or lead time still needs confirmation',
  EXT_PRICE_MISMATCH: 'The extended price does not match the unit price',
  NON_USD_CURRENCY: 'Quoted in a currency other than USD',
  NRE_CHARGE: 'Includes a one-time NRE charge',
  PREPAY_TERMS: 'Vendor asks for prepayment',
  MIN_ORDER: 'Vendor has a minimum order amount',
  QUOTE_EXPIRED: 'The quote validity has passed; pricing needs reconfirming',
  VALIDITY_AMBIGUOUS: 'The quote expiry date is not exact',
  MISSING_HEADER_FIELD: 'A commercial term is missing',
  MISSING_COO: 'Country of origin not stated',
  NON_US_COO: 'Made outside the US; Buy American / DFARS review needed',
  NO_CERT: 'No certificate of conformance offered',
  HAZMAT: 'Hazardous material handling applies',
  SURPLUS_SOURCE: 'Surplus stock; traceability documents requested',
  MISSING_REQUIRED_FIELD: 'Some product details are still missing',
};

/** How a product relates to the RFQ, as a badge word. */
export const MATCH_KIND_LABELS: Record<MatchKind, string> = { exact: 'Exact PN', alternate: 'ALT', unrequested: 'Not in RFQ' };

/** Source document labels in the source pane. */
export const DOC_ROLE_LABELS: Record<DocRole, string> = {
  rfq: 'RFQ sent', quote: 'Quote source', superseded: 'Superseded', 'no-quote': 'No quote content',
};

/** Label shown on the dimmed quoted-history part of a reply. */
export const HISTORY_LABEL = 'Earlier message in thread, ignored';
/** Tooltip on the variance column: the value appears in no vendor message. */
export const VARIANCE_TOOLTIP = "Not stated in the vendor's message; origin unknown";
