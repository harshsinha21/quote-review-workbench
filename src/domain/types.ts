// Domain contract shared by the parsers, the rules, the store and every view.
// Types only: no logic, no React. Fields may be added (optional only); never renamed or removed.

// ---------- raw input (mirrors state.json) ----------

/** One extracted quantity break, as the AI extraction wrote it. A claim, not truth. */
export interface RawLine { id: string; quantity: number; isQuoting: boolean; isFat: boolean | null;
  unitCost: number | null; variance: string; price: number | null; currency: string;
  leadTime: number | null; additionalNotes: string }
/** One extracted product (a quoted part) with its quantity breaks. */
export interface RawProduct { id: string; partNumber: string; nsn: string; description: string;
  packagingIncluded: boolean | null; certifications: string; nreCost: number | null; coo: string;
  hazmatItem: boolean | null; mfrCage: string; mfrPartNumber: string; shippingIncluded: boolean | null;
  additionalNotes: string; lines: RawLine[] }
/** A PDF attachment whose text is already split into pages. */
export interface RawAttachment { id: string; filename: string; pages: string[] }
/** One email in a vendor thread: the outbound RFQ or a vendor reply. */
export interface RawEmail { id: string; from: string; fromName: string; to: string; date: string;
  subject: string; body: string; attachments: RawAttachment[] }
/** One vendor: header terms, the email thread, the extraction and the AI follow-up draft. */
export interface RawVendor { id: string; name: string; contactName: string; contactEmail: string;
  cage: string; paymentTerms: string; daysQuoteValid: number | null; vendorContact: string;
  additionalNotes: string; followUpDraft: string; submittedAt: string | null;
  emails: RawEmail[]; products: RawProduct[] }
/** The whole input file (src/data/state.json). */
export interface RawState { vendors: RawVendor[] }

// ---------- source documents ----------

/** What a document is to the review: the RFQ, the current quote, an older quote, or no quote content. */
export type DocRole = 'rfq' | 'quote' | 'superseded' | 'no-quote';
/** One readable source: an email body, or one page of a PDF attachment. Spans index into `text`. */
export interface SourceDoc {
  key: string;                 // emailId, or `${emailId}:${attachmentId}:${pageIndex}`
  emailId: string;
  attachment?: { id: string; filename: string; page: number };   // page is 1-based
  role: DocRole; from: string; fromName: string; date: string; subject: string; text: string;
  historyStart?: number;       // offset of '-----Original Message-----'; text after it is ignored
}
/** A half-open character range [start, end) inside one SourceDoc's text. */
export interface Span { docKey: string; start: number; end: number }
/** One requested part on the RFQ, with its requested quantity breaks. */
export interface RfqItem { no: number; partNumber: string; nsn: string; qtys: number[]; span: Span }
/** The parsed RFQ (one vendor's copy; spans point into that copy). */
export interface Rfq { docKey: string; subject: string; sentAt: string; dueDate?: string; items: RfqItem[] }
/** One quantity break as written in the vendor's own text. */
export interface SourceLine { qty: number; currency: string; unitCost: number; price: number;
  leadTime: number; isFat: boolean; span: Span }
/** One item block as written in the vendor's own text (the evidence for a RawProduct). */
export interface SourceItem { no: number; partNumber: string; altFor?: string; extraStock: boolean;
  noBid: boolean; nsn?: string; description?: string; mfrPartNumber?: string; mfrCage?: string;
  coo?: string | null; hazmat?: boolean; packagingIncluded?: boolean; shippingIncluded?: boolean;
  certifications?: string; nreCost?: number | null; note?: string; noteSpan?: Span;
  lines: SourceLine[]; span: Span; headerSpan: Span }

// ---------- review ----------

/** How a product relates to the RFQ: the requested PN, an alternate for it, or not requested at all. */
export type MatchKind = 'exact' | 'alternate' | 'unrequested';
/** How far a number can be trusted: checked against the source, fixed from it, blocked, or unchecked. */
export type Trust = 'verified' | 'corrected' | 'open-issue' | 'unverified';
/** One extracted line after the overlay, paired with its source line when one exists. */
export interface LineReview { line: RawLine;           // overrides applied
  included: boolean;                                   // effective isQuoting
  source?: SourceLine; overridden: boolean;
  status: 'verified' | 'flagged' | 'unverified' }      // verified = commercial values equal the source
/** One extracted product after the overlay, matched to an RFQ item and paired with its source block. */
export interface ProductReview { product: RawProduct; kind: MatchKind; rfqNo?: number;
  source?: SourceItem; lines: LineReview[] }
/** Blockers gate "Mark verified" and award eligibility; warnings and info do not. */
export type Severity = 'blocker' | 'warning' | 'info';
/** Which kind of problem a rule looks for. */
export type Category = 'extraction' | 'coverage' | 'commercial' | 'compliance';
/** Every rule the engine can raise (one pure function each, see rules.ts). */
export type RuleId =
  | 'EXTRACTION_DROPPED_VALUE' | 'EXTRACTION_VALUE_MISMATCH' | 'EXTRACTION_FAT_MISMATCH'
  | 'EXTRACTION_NOBID_INVENTED_FIELDS' | 'EXTRACTION_FIELD_MISMATCH' | 'EXTRACTION_STRUCTURE'
  | 'NO_BID' | 'MISSING_QTY_BREAK' | 'EXTRA_QTY_BREAK' | 'ALTERNATE_OFFERED' | 'UNREQUESTED_PART'
  | 'LOOKALIKE_PART' | 'NSN_MISMATCH'
  | 'MISSING_PRICE' | 'EXT_PRICE_MISMATCH' | 'NON_USD_CURRENCY' | 'NRE_CHARGE' | 'PREPAY_TERMS'
  | 'MIN_ORDER' | 'QUOTE_EXPIRED' | 'VALIDITY_AMBIGUOUS' | 'MISSING_HEADER_FIELD'
  | 'MISSING_COO' | 'NON_US_COO' | 'NO_CERT' | 'HAZMAT' | 'SURPLUS_SOURCE' | 'MISSING_REQUIRED_FIELD';
/** A one-click correction a flag offers, always taken from the vendor's own text. */
export type Fix =
  | { kind: 'apply-source-line'; lineId: string;
      values: { unitCost: number; price: number; currency: string; leadTime: number; isFat: boolean } }
  | { kind: 'set-fat'; lineId: string; isFat: boolean };
/** One discrepancy found by a rule. Line-level flags set lineId, product-level set productId only,
 *  vendor-level set neither productId nor rfqNo. */
export interface Flag { id: string;      // `${vendorId}:${rule}:${productId ?? 'item' + rfqNo}:${qty ?? '-'}` ('vendor' when neither)
  vendorId: string; rule: RuleId; severity: Severity; category: Category;
  rfqNo?: number; productId?: string; lineId?: string; qty?: number;
  title: string; detail: string;         // detail states expected vs actual in one sentence
  evidence?: Span; fix?: Fix; followUp?: string;    // followUp set = vendor-facing ask
  fields?: string[];                     // added: the field names a field-listing rule found (one flag per scope)
  expected?: string; answered?: string;   // added: what should be (RFQ, email, requirement) and what came back
  discrepancy?: string }                   // added: the gap between them, in a few words
/** A reviewer's decision on one flag: accepted with a note, or the part excluded from award. */
export interface Decision { status: 'accepted' | 'excluded'; note: string; at: string;
  lineIds?: string[] }  // added: the lines an exclusion switched off, so Undo turns back on exactly those
/** Everything the reviewer changed, kept apart from state.json (which is never mutated). Persisted. */
export interface Overlay {
  lineOverrides: Record<string, Partial<Pick<RawLine,
    'unitCost' | 'price' | 'currency' | 'leadTime' | 'isFat' | 'isQuoting'>>>;
  decisions: Record<string, Decision>;            // by flag id
  followUpExcluded: Record<string, boolean>;      // flag ids unticked in the composer
  submittedAt: Record<string, string>;            // by vendor id ("Mark verified")
  poQuantity: Record<number, number>;             // rfqNo -> chosen qty; default = lowest requested
  audit: { at: string; vendorId: string; action: string; target: string; detail: string }[];
  settings: { eurUsd: number; asOf: string } }    // asOf = YYYY-MM-DD
/** One bullet of the generated follow-up email, with the flags it covers (added field). */
export interface FollowUpAsk {
  section: string;             // "Item 3 · MS21042L3", or "General" for vendor-level asks
  rfqNo?: number;              // undefined for "General"
  text: string;                // the bullet sentence as it appears in the email
  flagIds: string[];           // the open flags this bullet covers (several for grouped qty breaks)
  excluded: boolean }          // true when every covered flag is unticked in followUpExcluded
/** Everything the Ops view needs about one vendor, computed by buildReview. */
export interface VendorReview { vendor: RawVendor; rfq: Rfq; docs: SourceDoc[];
  products: ProductReview[];                       // by rfqNo, then unrequested
  flags: Flag[]; open: Flag[]; counts: Record<Severity, number>;   // counts = open flags
  coverage: { partsQuoted: number; parts: number; breaksQuoted: number; breaks: number };
  respondedAt: string; validUntil?: string; expired: boolean; sourceLabel: string;
  followUp: { generated: string; staleAsks: string[]; missedFlagIds: string[];
    asks?: FollowUpAsk[] };                        // added: every open ask, ticked or not, in email order
  canSubmit: boolean; status: 'needs-review' | 'ready' | 'submitted';
  hasParsedSource?: boolean }                      // added: false = no vendor doc parsed; show the "Could not auto-verify" banner
/** One vendor's offer for one RFQ item and quantity break. */
export interface CompareCell { vendorId: string; productId: string; lineId: string; kind: MatchKind;
  currency: string; unitCost: number | null; usd: number | null; leadTime: number | null;
  eligible: boolean; trust: Trust; evidence?: Span; badges: string[] }
/** One RFQ item and quantity break across vendors, with the cheapest eligible vendor. */
export interface CompareRow { rfqNo: number; partNumber: string; qty: number;
  cells: Record<string, CompareCell | undefined>; bestVendorId?: string }
/** One line on a draft purchase order. */
export interface PoLine { rfqNo: number; partNumber: string; lineId: string; qty: number;
  unitCost: number; currency: string; extended: number; leadTime: number }
/** One draft purchase order per vendor that wins at least one item. */
export interface PoDraft { vendorId: string; currency: string; lines: PoLine[];
  oneTimeCharges: { label: string; amount: number }[]; partsTotal: number; subtotal: number;
  subtotalUsd: number; minimumOrderUsd?: number; isBelowMinimum: boolean; paymentTerms: string }
/** The award plan: drafts per vendor, plus items no vendor can supply yet. */
export interface PoPlan { drafts: PoDraft[]; unsourced: { rfqNo: number; partNumber: string; qty: number }[] }
/** The whole derived review: the single output of buildReview. */
export interface ReviewModel { rfq: Rfq; vendors: VendorReview[]; compare: CompareRow[]; po: PoPlan }
