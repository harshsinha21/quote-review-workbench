// Internal contracts between the domain modules (parsers, matcher, rules, follow-up, compare, review).
// Types only. Each module implements the function named in its comment below.

import type { Flag, Overlay, ProductReview, RawVendor, Rfq, SourceDoc, SourceItem } from './types';

/**
 * Output of parseVendorSource(vendor) in parseSource.ts: every doc with its role, the RFQ parsed from
 * this vendor's copy (via parseRfq(doc) in parseRfq.ts), and the items parsed from the current quote docs.
 */
export interface ParsedSource {
  docs: SourceDoc[];          // RFQ first, then vendor docs in date order; roles assigned; historyStart set
  rfq: Rfq;                   // parsed from this vendor's RFQ copy (spans point into it)
  quoteDocs: SourceDoc[];     // the docs with role 'quote'
  items: SourceItem[];        // items parsed from quoteDocs (text before historyStart only), in order
  respondedAt: string;        // ISO date-time of the quote docs; '' when none
  sourceLabel: string;        // "Inline email" | "PDF attachment" | "Forwarded chain · rev 3" | "No parsable quote"
  hasParsedSource: boolean;   // false when no vendor doc yielded items
}

/** Everything a rule may read. Built by review.ts for each vendor. */
export interface RuleContext {
  vendor: RawVendor;
  rfq: Rfq;
  source: ParsedSource;
  products: ProductReview[];       // overlay applied and matched (reviewProducts in match.ts), by rfqNo then unrequested
  settings: Overlay['settings'];
  validUntil?: string;             // YYYY-MM-DD = respondedAt date + daysQuoteValid (addDaysIso in text.ts)
}

/** One rule: a pure function from context to flags (ids already set via makeFlagId in rules.ts). */
export type Rule = (context: RuleContext) => Flag[];

/*
 * Module signatures (both domain agents code against these exactly):
 *   text.ts       normalizePartNumber(pn: string): string; levenshtein(a: string, b: string): number;
 *                 findSpan(doc: SourceDoc, needle: string, fromIndex?: number): Span | undefined  (case-insensitive, parsed region only);
 *                 escapeRegExp(text: string): string; addDaysIso(isoDateOrDateTime: string, days: number): string (UTC, returns YYYY-MM-DD)
 *   parseRfq.ts   parseRfq(doc: SourceDoc): Rfq
 *   parseSource.ts parseVendorSource(vendor: RawVendor): ParsedSource   (never throws; hasParsedSource=false on failure)
 *   match.ts      reviewProducts(vendor: RawVendor, rfq: Rfq, items: SourceItem[], overlay: Overlay): ProductReview[];
 *                 computeCoverage(rfq: Rfq, products: ProductReview[]): VendorReview['coverage']
 *   rules.ts      RULES: Rule[]; runRules(context: RuleContext): Flag[]  (sorted blocker, warning, info);
 *                 makeFlagId(vendorId: string, rule: RuleId, scope: { productId?: string; rfqNo?: number; qty?: number }): string
 *   followUp.ts   buildFollowUp(context: RuleContext, openFlags: Flag[], followUpExcluded: Record<string, boolean>): VendorReview['followUp']
 *   compare.ts    buildCompare(rfq: Rfq, vendors: VendorReview[], settings: Overlay['settings']): CompareRow[];
 *                 buildPoPlan(rfq: Rfq, compare: CompareRow[], vendors: VendorReview[], overlay: Overlay): PoPlan
 *   review.ts     buildReview(state: RawState, overlay: Overlay): ReviewModel  (wires everything; per-vendor try/catch)
 *   export.ts     buildExportDocument(state: RawState, overlay: Overlay): ExportDocument
 */
export type { Flag };
