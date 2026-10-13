// The review rules of BUILD_PROMPT section 5.5 (with the section 11 corrections), one small pure function each.
// Rules only read the RuleContext: they never mutate it, never read the clock (dates come from settings.asOf) and
// never throw on messy data. Vendor text copied into titles and details is plain text, rendered as React text only.

import {
  BASE_CURRENCY, DOMESTIC_COO, FAT_PATTERN, LOOKALIKE_NSN_DISTANCE, LOOKALIKE_PN_DISTANCE, MIN_ORDER_PATTERN,
  NO_CERT_PATTERN, NO_QUOTE_MARKER, PREPAY_PATTERN, PRICE_TOLERANCE, SEVERITY_ORDER, SURPLUS_PATTERN,
  UNIT_COST_TOLERANCE,
} from './constants';
import type { Rule, RuleContext } from './context';
import { quotedQuantities } from './match';
import {
  currencyCode, findSpan, formatLongDate, isBlank, isKnownNumber, levenshtein, normalizePartNumber, parsedText, textOf,
} from './text';
import type {
  Category, Fix, Flag, LineReview, ProductReview, RawLine, RfqItem, RuleId, Severity, SourceDoc, SourceItem,
  SourceLine, Span,
} from './types';

// ---------- rule metadata ----------

/** Severity and category of every rule, as the section 5.5 table groups them. */
export const RULE_INFO: Record<RuleId, { severity: Severity; category: Category }> = {
  EXTRACTION_DROPPED_VALUE: { severity: 'blocker', category: 'extraction' },
  EXTRACTION_VALUE_MISMATCH: { severity: 'blocker', category: 'extraction' },
  EXTRACTION_FAT_MISMATCH: { severity: 'blocker', category: 'extraction' },
  EXTRACTION_NOBID_INVENTED_FIELDS: { severity: 'warning', category: 'extraction' },
  EXTRACTION_FIELD_MISMATCH: { severity: 'warning', category: 'extraction' },
  EXTRACTION_STRUCTURE: { severity: 'blocker', category: 'extraction' },
  NO_BID: { severity: 'warning', category: 'coverage' },
  MISSING_QTY_BREAK: { severity: 'warning', category: 'coverage' },
  EXTRA_QTY_BREAK: { severity: 'info', category: 'coverage' },
  ALTERNATE_OFFERED: { severity: 'warning', category: 'coverage' },
  UNREQUESTED_PART: { severity: 'info', category: 'coverage' },
  LOOKALIKE_PART: { severity: 'warning', category: 'coverage' },
  NSN_MISMATCH: { severity: 'blocker', category: 'coverage' },
  MISSING_PRICE: { severity: 'blocker', category: 'commercial' },
  EXT_PRICE_MISMATCH: { severity: 'blocker', category: 'commercial' },
  NON_USD_CURRENCY: { severity: 'warning', category: 'commercial' },
  NRE_CHARGE: { severity: 'info', category: 'commercial' },
  PREPAY_TERMS: { severity: 'warning', category: 'commercial' },
  MIN_ORDER: { severity: 'info', category: 'commercial' },
  QUOTE_EXPIRED: { severity: 'warning', category: 'commercial' },
  VALIDITY_AMBIGUOUS: { severity: 'info', category: 'commercial' },
  MISSING_HEADER_FIELD: { severity: 'blocker', category: 'commercial' },
  MISSING_COO: { severity: 'blocker', category: 'compliance' },
  NON_US_COO: { severity: 'warning', category: 'compliance' },
  NO_CERT: { severity: 'blocker', category: 'compliance' },
  HAZMAT: { severity: 'info', category: 'compliance' },
  SURPLUS_SOURCE: { severity: 'warning', category: 'compliance' },
  MISSING_REQUIRED_FIELD: { severity: 'warning', category: 'compliance' },
};

/** Readable names of the vendor header fields MISSING_HEADER_FIELD checks; the follow-up looks for these in a draft. */
export const HEADER_FIELD_LABELS: Record<string, string> = {
  paymentTerms: 'payment terms', daysQuoteValid: 'quote validity', vendorContact: 'vendor contact',
};

/** Readable names of the product fields MISSING_REQUIRED_FIELD lists in its ask. */
const REQUIRED_FIELD_LABELS: Record<string, string> = {
  packaging: 'packaging', shipping: 'shipping', hazmat: 'hazmat status', mfrCage: 'manufacturer CAGE',
  mfrPartNumber: 'manufacturer PN', nsn: 'NSN',
};

/** Fields an extraction must leave empty on a NO QUOTE block (section 11 item 2: false counts as set). */
const NO_BID_FIELDS = [
  'packagingIncluded', 'shippingIncluded', 'hazmatItem', 'certifications', 'coo', 'mfrCage', 'mfrPartNumber',
] as const;

/** A validity written as a month ("end of June"), per section 11 item 4, with word boundaries around the month. */
const VAGUE_VALIDITY_PATTERN =
  /valid[^\n]*?((?:end|mid|early|late|beginning)\s+of\s+)?\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
/** A no-bid note saying the part was superseded, so the ask also offers the superseding PN. */
const SUPERSEDED_PATTERN = /supersed/i;

// ---------- flag construction ----------

/** What a rule decides about a flag; createFlag adds the id, vendor, severity and category. */
interface FlagContent {
  rfqNo?: number; productId?: string; lineId?: string; qty?: number;
  title: string; detail: string; evidence?: Span; fix?: Fix; followUp?: string; fields?: string[];
}

/** The stable flag id: `${vendorId}:${rule}:${productId ?? 'item' + rfqNo}:${qty ?? '-'}`, with 'vendor' when unscoped. */
export function makeFlagId(
  vendorId: string, rule: RuleId, scope: { productId?: string; rfqNo?: number; qty?: number },
): string {
  const target = scope.productId ?? (scope.rfqNo !== undefined ? `item${scope.rfqNo}` : 'vendor');
  return `${vendorId}:${rule}:${target}:${scope.qty ?? '-'}`;
}

function createFlag(context: RuleContext, rule: RuleId, content: FlagContent): Flag {
  const { severity, category } = RULE_INFO[rule];
  return { id: makeFlagId(context.vendor.id, rule, content), vendorId: context.vendor.id, rule, severity, category, ...content };
}

// ---------- small helpers ----------

const isMissingValue = (value: unknown): boolean => value === null || value === undefined;
const isSet = (value: unknown): boolean => !isMissingValue(value) && !(typeof value === 'string' && value.trim() === '');
const formatAmount = (amount: number): string => amount.toFixed(2);
const isOffer = (productReview: ProductReview): boolean =>
  productReview.kind === 'exact' || productReview.kind === 'alternate';
/** Coverage and compliance rules apply to exact and alternate products that have at least one line. */
const isQuotedOffer = (productReview: ProductReview): boolean => isOffer(productReview) && productReview.lines.length > 0;

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function countOf(count: number, noun: string): string {
  const words = ['no', 'one', 'two', 'three'];
  return `${words[count] ?? String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function rfqItemByNo(context: RuleContext, rfqNo: number | undefined): RfqItem | undefined {
  return rfqNo === undefined ? undefined : context.rfq.items.find((item) => item.no === rfqNo);
}

/** "Item 3 MS21042L3" for asks that name the requested part; the product PN when it is on no RFQ item. */
function itemAndPart(context: RuleContext, productReview: ProductReview): string {
  const rfqItem = rfqItemByNo(context, productReview.rfqNo);
  return rfqItem ? `Item ${rfqItem.no} ${rfqItem.partNumber}` : productReview.product.partNumber;
}

/** "Item 3" for asks that only need the item number; the product PN when it is on no RFQ item. */
function itemOnly(productReview: ProductReview): string {
  return productReview.rfqNo !== undefined ? `Item ${productReview.rfqNo}` : productReview.product.partNumber;
}

export function quotedOffersForItem(context: RuleContext, rfqNo: number): ProductReview[] {
  return context.products.filter((productReview) => isQuotedOffer(productReview) && productReview.rfqNo === rfqNo);
}

function sourceItemForRfqItem(context: RuleContext, rfqItem: RfqItem): SourceItem | undefined {
  const rfqPn = normalizePartNumber(rfqItem.partNumber);
  return context.source.items.find((item) => normalizePartNumber(item.partNumber) === rfqPn
    || (item.altFor !== undefined && normalizePartNumber(item.altFor) === rfqPn));
}

/** The grouped follow-up sentence asking for the missing quantity breaks of one RFQ item. */
export function missingBreaksSentence(rfqItem: RfqItem, missingQtys: number[]): string {
  const noun = missingQtys.length === 1 ? 'break' : 'breaks';
  return `Item ${rfqItem.no} ${rfqItem.partNumber}: please add the ${joinWithAnd(missingQtys.map(String))} pc ${noun} `
    + `(we requested ${rfqItem.qtys.join('/')}).`;
}

/** The minimum order amount in a vendor's header notes ("Minimum order $250" gives 250), if there is one. */
export function parseMinimumOrder(notes: unknown): number | undefined {
  const match = textOf(notes).match(MIN_ORDER_PATTERN);
  if (!match) return undefined;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : undefined;
}

// ---------- commercial values of a line ----------

interface CommercialValues { unitCost: number; price: number; currency: string; leadTime: number }

/** The line's unit cost, price, currency and lead time when all four are present. */
function commercialValues(line: RawLine): CommercialValues | undefined {
  const { unitCost, price, leadTime } = line;
  if (!isKnownNumber(unitCost) || !isKnownNumber(price) || !isKnownNumber(leadTime) || isBlank(line.currency)) {
    return undefined;
  }
  return { unitCost, price, currency: currencyCode(line.currency), leadTime };
}

function missingValueNames(line: RawLine): string[] {
  const checks: [string, boolean][] = [
    ['unit cost', !isKnownNumber(line.unitCost)], ['extended price', !isKnownNumber(line.price)],
    ['lead time', !isKnownNumber(line.leadTime)], ['currency', isBlank(line.currency)],
  ];
  return checks.filter(([, isMissing]) => isMissing).map(([name]) => name);
}

function describeValues(values: CommercialValues): string {
  return `${values.currency} ${formatAmount(values.unitCost)} ea / ${formatAmount(values.price)} ext / ${values.leadTime}d`;
}

function applySourceLineFix(lineId: string, sourceLine: SourceLine): Fix {
  const { unitCost, price, currency, leadTime, isFat } = sourceLine;
  return { kind: 'apply-source-line', lineId, values: { unitCost, price, currency, leadTime, isFat } };
}

function lineScope(productReview: ProductReview, line: RawLine): Pick<FlagContent, 'productId' | 'rfqNo' | 'lineId' | 'qty'> {
  return { productId: productReview.product.id, rfqNo: productReview.rfqNo, lineId: line.id, qty: line.quantity };
}

// ---------- evidence ----------

function docByKey(context: RuleContext, docKey: string): SourceDoc | undefined {
  return context.source.docs.find((doc) => doc.key === docKey);
}

/** Widens a span to its whole line, without indentation, so the highlight reads as one statement. */
function wholeLine(doc: SourceDoc, span: Span): Span {
  const text = textOf(doc.text);
  let start = text.lastIndexOf('\n', Math.max(0, span.start - 1)) + 1;
  if (start > span.start) start = span.start;
  while (start < span.start && (text[start] === ' ' || text[start] === '\t')) start += 1;
  const newline = text.indexOf('\n', span.end);
  let end = newline === -1 ? text.length : newline;
  while (end > span.end && /\s/.test(text[end - 1])) end -= 1;
  return { docKey: doc.key, start, end };
}

/** The whole line holding `needle` inside one source item block, when the block has it. */
function lineInItem(context: RuleContext, item: SourceItem | undefined, needle: string): Span | undefined {
  if (!item) return undefined;
  const doc = docByKey(context, item.span.docKey);
  if (!doc) return undefined;
  const found = findSpan(doc, needle, item.span.start);
  return found && found.start < item.span.end ? wholeLine(doc, found) : undefined;
}

/** The whole line holding `needle` in the vendor's own text: the current quote first, then older vendor docs. */
function lineInVendorText(context: RuleContext, needle: string): Span | undefined {
  const quoteKeys = new Set(context.source.quoteDocs.map((doc) => doc.key));
  const olderVendorDocs = context.source.docs.filter((doc) => doc.role !== 'rfq' && !quoteKeys.has(doc.key));
  for (const doc of [...context.source.quoteDocs, ...olderVendorDocs]) {
    const found = findSpan(doc, needle);
    if (found) return wholeLine(doc, found);
  }
  return undefined;
}

/** The "mfr PN ...; COO ...; hazmat ..." line of a product's block, else its header. */
function manufacturerLine(context: RuleContext, productReview: ProductReview): Span | undefined {
  return lineInItem(context, productReview.source, 'mfr PN') ?? productReview.source?.headerSpan;
}

// ---------- extraction rules ----------

interface SourcedLine { productReview: ProductReview; lineReview: LineReview; sourceLine: SourceLine }

function sourcedLines(context: RuleContext): SourcedLine[] {
  return context.products.flatMap((productReview) => productReview.lines.flatMap((lineReview) =>
    (lineReview.source ? [{ productReview, lineReview, sourceLine: lineReview.source }] : [])));
}

/** EXTRACTION_DROPPED_VALUE: the vendor text has the break, the extraction lost a value. */
function droppedValues(context: RuleContext): Flag[] {
  return sourcedLines(context).flatMap(({ productReview, lineReview, sourceLine }) => {
    const { line } = lineReview;
    if (commercialValues(line)) return [];
    return [createFlag(context, 'EXTRACTION_DROPPED_VALUE', {
      ...lineScope(productReview, line),
      title: `Price not captured for ${line.quantity} pcs`,
      detail: `The quote says ${describeValues(sourceLine)}, but the extraction left `
        + `${joinWithAnd(missingValueNames(line))} empty.`,
      evidence: sourceLine.span,
      fix: applySourceLineFix(line.id, sourceLine),
    })];
  });
}

/** EXTRACTION_VALUE_MISMATCH: every value is present but one differs from the vendor text. */
function valueMismatches(context: RuleContext): Flag[] {
  return sourcedLines(context).flatMap(({ productReview, lineReview, sourceLine }) => {
    const { line } = lineReview;
    const values = commercialValues(line);
    if (!values) return [];
    const differs = Math.abs(values.unitCost - sourceLine.unitCost) > UNIT_COST_TOLERANCE
      || Math.abs(values.price - sourceLine.price) > PRICE_TOLERANCE
      || values.currency !== sourceLine.currency || values.leadTime !== sourceLine.leadTime;
    if (!differs) return [];
    return [createFlag(context, 'EXTRACTION_VALUE_MISMATCH', {
      ...lineScope(productReview, line),
      title: `Captured values differ for ${line.quantity} pcs`,
      detail: `The quote says ${describeValues(sourceLine)}, but the extraction has ${describeValues(values)}.`,
      evidence: sourceLine.span,
      fix: applySourceLineFix(line.id, sourceLine),
    })];
  });
}

/** EXTRACTION_FAT_MISMATCH: the first article test flag disagrees with the vendor text. */
function fatMismatches(context: RuleContext): Flag[] {
  return sourcedLines(context).flatMap(({ productReview, lineReview, sourceLine }) => {
    const { line } = lineReview;
    if ((line.isFat ?? false) === sourceLine.isFat) return [];
    const source = productReview.source;
    const noteNamesFat = source?.note !== undefined && FAT_PATTERN.test(source.note);
    const qty = line.quantity;
    return [createFlag(context, 'EXTRACTION_FAT_MISMATCH', {
      ...lineScope(productReview, line),
      title: sourceLine.isFat ? `FAT not captured for ${qty} pcs` : `FAT added by extraction for ${qty} pcs`,
      detail: sourceLine.isFat
        ? `The quote puts first article test (FAT) on the ${qty} pc line, but the extraction says no FAT.`
        : `The quote does not ask for first article test (FAT) on ${qty} pcs, but the extraction says FAT.`,
      evidence: (noteNamesFat ? source?.noteSpan : undefined) ?? sourceLine.span,
      fix: { kind: 'set-fat', lineId: line.id, isFat: sourceLine.isFat },
    })];
  });
}

/** EXTRACTION_NOBID_INVENTED_FIELDS: the vendor wrote NO QUOTE, yet the extraction filled in part details. */
function noBidInventedFields(context: RuleContext): Flag[] {
  return context.products.flatMap((productReview) => {
    const { product, source } = productReview;
    if (!source?.noBid) return [];
    const fields: string[] = NO_BID_FIELDS.filter((fieldName) => isSet(product[fieldName]));
    if (fields.length === 0) return [];
    return [createFlag(context, 'EXTRACTION_NOBID_INVENTED_FIELDS', {
      productId: product.id, rfqNo: productReview.rfqNo, fields,
      title: 'Details filled in on a no-bid',
      detail: `The quote says ${NO_QUOTE_MARKER} for ${product.partNumber}, but the extraction filled in ${joinWithAnd(fields)}.`,
      evidence: lineInItem(context, source, NO_QUOTE_MARKER) ?? source.noteSpan ?? source.span,
    })];
  });
}

type FieldValue = string | number | boolean | null;

function formatFieldValue(value: FieldValue): string {
  if (value === null || value === '') return 'empty';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return typeof value === 'number' ? String(value) : `"${value}"`;
}

/** EXTRACTION_FIELD_MISMATCH: a quoted part's details differ from its block in the vendor text. */
function fieldMismatches(context: RuleContext): Flag[] {
  const trimmed = (value: unknown): string => textOf(value).trim();
  return context.products.flatMap((productReview) => {
    const { product, source } = productReview;
    if (!source || source.noBid) return [];
    const comparisons: [string, FieldValue, FieldValue][] = [
      ['nsn', trimmed(product.nsn), trimmed(source.nsn)],
      ['mfrPartNumber', trimmed(product.mfrPartNumber), trimmed(source.mfrPartNumber)],
      ['mfrCage', trimmed(product.mfrCage), trimmed(source.mfrCage)],
      ['coo', trimmed(product.coo), trimmed(source.coo)],
      ['hazmat', product.hazmatItem ?? null, source.hazmat ?? null],
      ['packaging', product.packagingIncluded ?? null, source.packagingIncluded ?? null],
      ['shipping', product.shippingIncluded ?? null, source.shippingIncluded ?? null],
      ['certs', trimmed(product.certifications), trimmed(source.certifications)],
      ['nre', product.nreCost ?? null, source.nreCost ?? null],
    ];
    const differing = comparisons.filter(([, extracted, quoted]) => extracted !== quoted);
    if (differing.length === 0) return [];
    const differences = differing.map(([fieldName, extracted, quoted]) =>
      `${fieldName} ${formatFieldValue(quoted)} vs ${formatFieldValue(extracted)}`);
    return [createFlag(context, 'EXTRACTION_FIELD_MISMATCH', {
      productId: product.id, rfqNo: productReview.rfqNo, fields: differing.map(([fieldName]) => fieldName),
      title: 'Part details differ from the quote',
      detail: `Quote vs extraction for ${product.partNumber}: ${differences.join('; ')}.`,
      evidence: source.headerSpan,
    })];
  });
}

/** EXTRACTION_STRUCTURE: a part or break exists on one side (extraction or vendor text) only. */
function structureIssues(context: RuleContext): Flag[] {
  const flags: Flag[] = [];
  for (const productReview of context.products) {
    const { product, source } = productReview;
    if (!source) {
      flags.push(createFlag(context, 'EXTRACTION_STRUCTURE', {
        productId: product.id, rfqNo: productReview.rfqNo,
        title: 'Part not found in the quote',
        detail: `The extraction has ${product.partNumber}, but the quote text has no item block for it.`,
        evidence: rfqItemByNo(context, productReview.rfqNo)?.span,
      }));
      continue;
    }
    for (const lineReview of productReview.lines) {
      if (lineReview.source) continue;
      const qty = lineReview.line.quantity;
      flags.push(createFlag(context, 'EXTRACTION_STRUCTURE', {
        ...lineScope(productReview, lineReview.line),
        title: `${qty} pcs not in the quote`,
        detail: `The extraction has a ${qty} pc line for ${product.partNumber}, but the quote text has no such break.`,
        evidence: source.headerSpan,
      }));
    }
    const extractedQtys = new Set(productReview.lines.map((lineReview) => lineReview.line.quantity));
    for (const sourceLine of source.lines) {
      if (extractedQtys.has(sourceLine.qty)) continue;
      flags.push(createFlag(context, 'EXTRACTION_STRUCTURE', {
        productId: product.id, rfqNo: productReview.rfqNo, qty: sourceLine.qty,
        title: `${sourceLine.qty} pcs not extracted`,
        detail: `The quote has a ${sourceLine.qty} pc break for ${product.partNumber}, but the extraction has no line for it.`,
        evidence: sourceLine.span,
      }));
    }
  }
  const extractedPns = new Set(context.products.map((productReview) => normalizePartNumber(productReview.product.partNumber)));
  for (const sourceItem of context.source.items) {
    if (extractedPns.has(normalizePartNumber(sourceItem.partNumber))) continue;
    const sourcePn = normalizePartNumber(sourceItem.partNumber);
    const altFor = sourceItem.altFor === undefined ? '' : normalizePartNumber(sourceItem.altFor);
    const rfqItem = context.rfq.items.find((item) =>
      [sourcePn, altFor].includes(normalizePartNumber(item.partNumber)));
    flags.push(createFlag(context, 'EXTRACTION_STRUCTURE', {
      rfqNo: rfqItem?.no ?? sourceItem.no,
      title: `${sourceItem.partNumber} not extracted`,
      detail: `The quote has an item block for ${sourceItem.partNumber}, but the extraction has no product for it.`,
      evidence: sourceItem.headerSpan,
    }));
  }
  return flags;
}

// ---------- coverage rules ----------

/** NO_BID: an RFQ item has no exact or alternate product with lines. */
function noBids(context: RuleContext): Flag[] {
  return context.rfq.items.flatMap((rfqItem) => {
    if (quotedOffersForItem(context, rfqItem.no).length > 0) return [];
    const productReview = context.products.find((candidate) => candidate.rfqNo === rfqItem.no);
    const sourceItem = productReview?.source ?? sourceItemForRfqItem(context, rfqItem);
    const sourceNote = textOf(sourceItem?.note).trim();
    const productNote = textOf(productReview?.product.additionalNotes).trim();
    const vendorNote = sourceNote || productNote;
    const saysSuperseded = SUPERSEDED_PATTERN.test(sourceNote) || SUPERSEDED_PATTERN.test(productNote);
    const requested = `${rfqItem.qtys.join('/')} pcs of ${rfqItem.partNumber}`;
    return [createFlag(context, 'NO_BID', {
      rfqNo: rfqItem.no, productId: productReview?.product.id,
      title: 'No bid',
      detail: vendorNote
        ? `We requested ${requested}; the vendor declined with the note "${vendorNote}"`
        : `We requested ${requested}; the quote has no price for it.`,
      evidence: sourceItem?.noteSpan ?? sourceItem?.span ?? rfqItem.span,
      followUp: `Item ${rfqItem.no} ${rfqItem.partNumber}: you marked this no-bid. `
        + `Can you quote it${saysSuperseded ? ', or the current superseding PN' : ''}?`,
    })];
  });
}

/** MISSING_QTY_BREAK: a requested quantity that no exact or alternate line quotes (not raised for no-bids). */
function missingQtyBreaks(context: RuleContext): Flag[] {
  return context.rfq.items.flatMap((rfqItem) => {
    const offers = quotedOffersForItem(context, rfqItem.no);
    if (offers.length === 0) return [];
    const quotedQtys = quotedQuantities(context.products, rfqItem.no);
    const missingQtys = rfqItem.qtys.filter((qty) => !quotedQtys.has(qty));
    const covered = [...quotedQtys].sort((left, right) => left - right).join('/') || 'none';
    return missingQtys.map((qty) => createFlag(context, 'MISSING_QTY_BREAK', {
      rfqNo: rfqItem.no, productId: offers[0].product.id, qty,
      title: `Not quoted: ${qty} pcs`,
      detail: `We requested ${rfqItem.qtys.join('/')} pcs; the quote covers ${covered}.`,
      evidence: rfqItem.span,
      followUp: missingBreaksSentence(rfqItem, missingQtys),
    }));
  });
}

/** EXTRA_QTY_BREAK: a quoted quantity that was not requested. */
function extraQtyBreaks(context: RuleContext): Flag[] {
  return context.products.filter(isQuotedOffer).flatMap((productReview) => {
    const requested = rfqItemByNo(context, productReview.rfqNo)?.qtys ?? [];
    return productReview.lines.filter((lineReview) => !requested.includes(lineReview.line.quantity))
      .map((lineReview) => createFlag(context, 'EXTRA_QTY_BREAK', {
        ...lineScope(productReview, lineReview.line),
        title: `Extra break: ${lineReview.line.quantity} pcs`,
        detail: `We requested ${requested.join('/')} pcs; the quote adds ${lineReview.line.quantity} pcs.`,
        evidence: lineReview.source?.span ?? productReview.source?.headerSpan,
      }));
  });
}

/** ALTERNATE_OFFERED: the vendor quoted another PN for a requested item. */
function alternatesOffered(context: RuleContext): Flag[] {
  return context.products.filter((productReview) => productReview.kind === 'alternate' && productReview.lines.length > 0)
    .flatMap((productReview) => {
      const rfqItem = rfqItemByNo(context, productReview.rfqNo);
      if (!rfqItem) return [];
      const altPn = productReview.product.partNumber;
      return [createFlag(context, 'ALTERNATE_OFFERED', {
        rfqNo: rfqItem.no, productId: productReview.product.id,
        title: `Alternate offered: ${altPn}`,
        detail: `We requested ${rfqItem.partNumber}; the vendor quoted ${altPn} instead.`,
        evidence: productReview.source?.headerSpan,
        followUp: `Item ${rfqItem.no}: you offered ${altPn} instead of ${rfqItem.partNumber}. Please quote `
          + `${rfqItem.partNumber} exactly if you can, or send the spec sheet so we can review the alternate.`,
      })];
    });
}

/** UNREQUESTED_PART: a part on no RFQ item, excluded from award by default. */
function unrequestedParts(context: RuleContext): Flag[] {
  return context.products.filter((productReview) => productReview.kind === 'unrequested')
    .map((productReview) => createFlag(context, 'UNREQUESTED_PART', {
      productId: productReview.product.id,
      title: `Not on the RFQ: ${productReview.product.partNumber}`,
      detail: `We requested ${context.rfq.items.length} parts and ${productReview.product.partNumber} is not one of them, `
        + 'so it stays out of the award unless you include it.',
      evidence: productReview.source?.headerSpan,
    }));
}

interface Resemblance { item: RfqItem; distance: number }

function closestWithin(items: RfqItem[], distanceTo: (item: RfqItem) => number, maxDistance: number): Resemblance | undefined {
  let closest: Resemblance | undefined;
  for (const item of items) {
    const distance = distanceTo(item);
    if (distance <= maxDistance && (closest === undefined || distance < closest.distance)) closest = { item, distance };
  }
  return closest;
}

/** LOOKALIKE_PART: an unrequested PN or NSN a typo away from a requested one (productId only, section 11 item 3). */
function lookalikeParts(context: RuleContext): Flag[] {
  return context.products.filter((productReview) => productReview.kind === 'unrequested').flatMap((productReview) => {
    const { product } = productReview;
    const productPn = normalizePartNumber(product.partNumber);
    const productNsn = textOf(product.nsn).trim();
    const pnMatch = closestWithin(context.rfq.items,
      (item) => levenshtein(productPn, normalizePartNumber(item.partNumber)), LOOKALIKE_PN_DISTANCE);
    const nsnMatch = productNsn === '' ? undefined : closestWithin(context.rfq.items,
      (item) => levenshtein(productNsn, textOf(item.nsn).trim()), LOOKALIKE_NSN_DISTANCE);
    const closest = pnMatch ?? nsnMatch;
    if (!closest) return [];
    const resemblances: string[] = [];
    if (pnMatch) resemblances.push(`its PN is ${countOf(pnMatch.distance, 'character')} off ${pnMatch.item.partNumber}`);
    if (nsnMatch) {
      resemblances.push(`its NSN ${productNsn} is ${countOf(nsnMatch.distance, 'digit')} off `
        + `${nsnMatch.item.nsn} (${nsnMatch.item.partNumber})`);
    }
    const likeness = pnMatch
      ? `is ${countOf(pnMatch.distance, 'character')} off ${pnMatch.item.partNumber}`
      : `has an NSN ${countOf(closest.distance, 'digit')} off the NSN of ${closest.item.partNumber}`;
    return [createFlag(context, 'LOOKALIKE_PART', {
      productId: product.id,
      title: `Looks like ${closest.item.partNumber}`,
      detail: `${product.partNumber} is not on the RFQ, but ${joinWithAnd(resemblances)}.`,
      evidence: productReview.source?.headerSpan,
      followUp: `${product.partNumber} was not on our RFQ and ${likeness}. Please confirm it is not meant as a substitute.`,
    })];
  });
}

/** NSN_MISMATCH: an exact part whose NSN differs from the RFQ. */
function nsnMismatches(context: RuleContext): Flag[] {
  return context.products.filter((productReview) => productReview.kind === 'exact' && productReview.lines.length > 0)
    .flatMap((productReview) => {
      const rfqItem = rfqItemByNo(context, productReview.rfqNo);
      const quotedNsn = textOf(productReview.product.nsn).trim();
      if (!rfqItem || quotedNsn === textOf(rfqItem.nsn).trim()) return [];
      return [createFlag(context, 'NSN_MISMATCH', {
        rfqNo: rfqItem.no, productId: productReview.product.id,
        title: 'NSN differs from the RFQ',
        detail: `We requested NSN ${rfqItem.nsn}; the quote has ${quotedNsn || 'no NSN'}.`,
        evidence: lineInItem(context, productReview.source, 'NSN') ?? productReview.source?.headerSpan,
        followUp: `Item ${rfqItem.no}: please confirm the NSN.`,
      })];
    });
}

// ---------- commercial rules ----------

/** MISSING_PRICE: an included line misses values and the vendor text has none to apply. */
function missingPrices(context: RuleContext): Flag[] {
  return context.products.flatMap((productReview) => productReview.lines
    .filter((lineReview) => lineReview.included && !lineReview.source && !commercialValues(lineReview.line))
    .map((lineReview) => {
      const qty = lineReview.line.quantity;
      return createFlag(context, 'MISSING_PRICE', {
        ...lineScope(productReview, lineReview.line),
        title: `No price for ${qty} pcs`,
        detail: `We need a full price for ${qty} pcs; the quote leaves ${joinWithAnd(missingValueNames(lineReview.line))} empty.`,
        evidence: productReview.source?.headerSpan ?? rfqItemByNo(context, productReview.rfqNo)?.span,
        followUp: `${itemAndPart(context, productReview)}: please confirm price and lead time for ${qty} pcs.`,
      });
    }));
}

/** EXT_PRICE_MISMATCH: quantity times unit cost is more than a cent off the extended price. */
function extPriceMismatches(context: RuleContext): Flag[] {
  return context.products.flatMap((productReview) => productReview.lines.flatMap((lineReview) => {
    const { line } = lineReview;
    if (!isKnownNumber(line.unitCost) || !isKnownNumber(line.price)) return [];
    const expected = line.quantity * line.unitCost;
    if (Math.abs(expected - line.price) <= PRICE_TOLERANCE) return [];
    return [createFlag(context, 'EXT_PRICE_MISMATCH', {
      ...lineScope(productReview, line),
      title: `Extended price off for ${line.quantity} pcs`,
      detail: `${line.quantity} x ${formatAmount(line.unitCost)} is ${formatAmount(expected)}, but the line says ${formatAmount(line.price)}.`,
      evidence: lineReview.source?.span ?? productReview.source?.headerSpan,
      followUp: `${itemOnly(productReview)}: the extended price for ${line.quantity} pcs does not match the unit price. Please confirm.`,
    })];
  }));
}

/** NON_USD_CURRENCY: an included line in a currency other than USD; empty currencies belong to extraction (section 11 item 1). */
function nonUsdCurrency(context: RuleContext): Flag[] {
  const offending = context.products.flatMap((productReview) => productReview.lines).filter((lineReview) =>
    lineReview.included && !isBlank(lineReview.line.currency) && currencyCode(lineReview.line.currency) !== BASE_CURRENCY);
  if (offending.length === 0) return [];
  const currencies = [...new Set(offending.map((lineReview) => currencyCode(lineReview.line.currency)))];
  const firstSourced = offending.find((lineReview) => lineReview.source !== undefined);
  return [createFlag(context, 'NON_USD_CURRENCY', {
    title: `Quoted in ${currencies.join(', ')}`,
    detail: `We compare in ${BASE_CURRENCY}, but ${offending.length} included `
      + `${offending.length === 1 ? 'line is' : 'lines are'} in ${joinWithAnd(currencies)}.`,
    evidence: firstSourced?.source?.span ?? lineInVendorText(context, currencies[0]),
    followUp: `Can you quote in ${BASE_CURRENCY}, or confirm your ${currencies.join('/')} pricing terms?`,
  })];
}

/** NRE_CHARGE: a one-time engineering charge on a part. */
function nreCharges(context: RuleContext): Flag[] {
  return context.products.flatMap((productReview) => {
    const { product } = productReview;
    const nre = product.nreCost;
    if (!isKnownNumber(nre) || nre <= 0) return [];
    return [createFlag(context, 'NRE_CHARGE', {
      productId: product.id, rfqNo: productReview.rfqNo,
      title: `NRE charge ${formatAmount(nre)}`,
      detail: `${product.partNumber} carries a one-time NRE charge of ${formatAmount(nre)} on top of its unit prices.`,
      evidence: lineInItem(context, productReview.source, '; NRE') ?? productReview.source?.headerSpan,
    })];
  });
}

/** PREPAY_TERMS: payment is due before shipment. */
function prepayTerms(context: RuleContext): Flag[] {
  const terms = textOf(context.vendor.paymentTerms).trim();
  if (!PREPAY_PATTERN.test(terms)) return [];
  return [createFlag(context, 'PREPAY_TERMS', {
    title: 'Prepayment required',
    detail: `We expect net terms, but the vendor asks for "${terms}".`,
    evidence: lineInVendorText(context, 'prepay'),
  })];
}

/** MIN_ORDER: the vendor's notes set a minimum order amount. */
function minimumOrder(context: RuleContext): Flag[] {
  const amount = parseMinimumOrder(context.vendor.additionalNotes);
  if (amount === undefined) return [];
  return [createFlag(context, 'MIN_ORDER', {
    title: `Minimum order $${amount}`,
    detail: `The vendor's notes set a minimum order of $${amount}, so a smaller PO may be refused.`,
    evidence: lineInVendorText(context, 'minimum order'),
  })];
}

/** QUOTE_EXPIRED: validUntil (reply date plus daysQuoteValid) is before settings.asOf. */
function quoteExpired(context: RuleContext): Flag[] {
  const validUntil = textOf(context.validUntil);
  if (validUntil === '' || !(validUntil < textOf(context.settings.asOf))) return [];
  return [createFlag(context, 'QUOTE_EXPIRED', {
    title: `Quote expired ${formatLongDate(validUntil)}`,
    detail: `The quote ran out on ${formatLongDate(validUntil)}, before the review date of ${formatLongDate(textOf(context.settings.asOf))}.`,
    evidence: lineInVendorText(context, 'valid'),
    followUp: `Your quote validity ended ${formatLongDate(validUntil)}. Please confirm the pricing still holds.`,
  })];
}

/** VALIDITY_AMBIGUOUS: the current quote states its validity as a month instead of a number of days. */
function vagueValidity(context: RuleContext): Flag[] {
  for (const doc of context.source.quoteDocs) {
    const match = VAGUE_VALIDITY_PATTERN.exec(parsedText(doc));
    if (!match) continue;
    const quoted = `${match[1] ?? ''}${match[2]}`;
    return [createFlag(context, 'VALIDITY_AMBIGUOUS', {
      title: 'Validity date is vague',
      detail: `We need an exact expiry date, but the quote says "${quoted}".`,
      evidence: { docKey: doc.key, start: match.index, end: match.index + match[0].length },
      followUp: `Please confirm the exact quote expiry date (you wrote "${quoted}").`,
    })];
  }
  return [];
}

/** MISSING_HEADER_FIELD: payment terms, validity days or vendor contact is empty (one flag per vendor). */
function missingHeaderFields(context: RuleContext): Flag[] {
  const { vendor } = context;
  const checks: [string, boolean][] = [
    ['paymentTerms', isBlank(vendor.paymentTerms)], ['daysQuoteValid', !isKnownNumber(vendor.daysQuoteValid)],
    ['vendorContact', isBlank(vendor.vendorContact)],
  ];
  const fields = checks.filter(([, isMissing]) => isMissing).map(([fieldName]) => fieldName);
  if (fields.length === 0) return [];
  const labels = joinWithAnd(fields.map((fieldName) => HEADER_FIELD_LABELS[fieldName] ?? fieldName));
  return [createFlag(context, 'MISSING_HEADER_FIELD', {
    fields,
    title: `Missing ${labels}`,
    detail: `The quote header should state ${labels}, but the extraction has none.`,
    evidence: lineInVendorText(context, 'header'),
    followUp: `Please confirm your ${labels}.`,
  })];
}

// ---------- compliance rules ----------

/** MISSING_COO: no country of origin on a quoted part. */
function missingCoo(context: RuleContext): Flag[] {
  return context.products.filter(isQuotedOffer).filter((productReview) => isBlank(productReview.product.coo))
    .map((productReview) => createFlag(context, 'MISSING_COO', {
      productId: productReview.product.id, rfqNo: productReview.rfqNo,
      title: 'No country of origin',
      detail: `We need the country of origin for ${productReview.product.partNumber}, but the quote does not state one.`,
      evidence: manufacturerLine(context, productReview),
      followUp: `${itemAndPart(context, productReview)}: please confirm the country of origin.`,
    }));
}

/** NON_US_COO: a quoted part made outside the US, which needs a Buy American / DFARS check. */
function nonUsCoo(context: RuleContext): Flag[] {
  return context.products.filter(isQuotedOffer).flatMap((productReview) => {
    const coo = textOf(productReview.product.coo).trim();
    if (coo === '' || coo.toUpperCase() === DOMESTIC_COO) return [];
    return [createFlag(context, 'NON_US_COO', {
      productId: productReview.product.id, rfqNo: productReview.rfqNo,
      title: `Made in ${coo}`,
      detail: `We prefer ${DOMESTIC_COO} origin, but ${productReview.product.partNumber} is made in ${coo}: check Buy American / DFARS rules.`,
      evidence: manufacturerLine(context, productReview),
    })];
  });
}

/** NO_CERT: a quoted part with no certification. */
function noCert(context: RuleContext): Flag[] {
  return context.products.filter(isQuotedOffer).flatMap((productReview) => {
    const certs = textOf(productReview.product.certifications).trim();
    if (certs !== '' && !NO_CERT_PATTERN.test(certs)) return [];
    const { source } = productReview;
    return [createFlag(context, 'NO_CERT', {
      productId: productReview.product.id, rfqNo: productReview.rfqNo,
      title: 'No certification',
      detail: certs === ''
        ? `We need a C of C for ${productReview.product.partNumber}, but the quote lists no certification.`
        : `We need a C of C for ${productReview.product.partNumber}, but the quote says "${certs}".`,
      evidence: lineInItem(context, source, '; certs') ?? lineInItem(context, source, 'cert') ?? source?.headerSpan,
      followUp: `${itemAndPart(context, productReview)}: your quote shows no certification. We need a C of C. Can you provide one?`,
    })];
  });
}

/** HAZMAT: a quoted part that ships as hazardous material. */
function hazmatItems(context: RuleContext): Flag[] {
  return context.products.filter(isQuotedOffer).filter((productReview) => productReview.product.hazmatItem === true)
    .map((productReview) => createFlag(context, 'HAZMAT', {
      productId: productReview.product.id, rfqNo: productReview.rfqNo,
      title: 'Hazmat item',
      detail: `${productReview.product.partNumber} ships as hazmat, so expect special packaging and freight.`,
      evidence: manufacturerLine(context, productReview),
    }));
}

/** SURPLUS_SOURCE: a quoted part from surplus stock, which needs traceability documents. */
function surplusSources(context: RuleContext): Flag[] {
  return context.products.filter(isQuotedOffer)
    .filter((productReview) => SURPLUS_PATTERN.test(textOf(productReview.product.description))
      || SURPLUS_PATTERN.test(textOf(productReview.product.additionalNotes)))
    .map((productReview) => createFlag(context, 'SURPLUS_SOURCE', {
      productId: productReview.product.id, rfqNo: productReview.rfqNo,
      title: 'Surplus stock',
      detail: `We need traceable stock, but ${productReview.product.partNumber} is surplus.`,
      evidence: lineInItem(context, productReview.source, 'surplus') ?? productReview.source?.headerSpan,
      followUp: `${itemOnly(productReview)}: please send traceability documents for the surplus ${productReview.product.partNumber}.`,
    }));
}

/** MISSING_REQUIRED_FIELD: a quoted part without packaging, shipping, hazmat, CAGE, manufacturer PN or NSN (one flag per part). */
function missingRequiredFields(context: RuleContext): Flag[] {
  return context.products.filter(isQuotedOffer).flatMap((productReview) => {
    const { product } = productReview;
    const checks: [string, boolean][] = [
      ['packaging', isMissingValue(product.packagingIncluded)], ['shipping', isMissingValue(product.shippingIncluded)],
      ['hazmat', isMissingValue(product.hazmatItem)], ['mfrCage', isBlank(product.mfrCage)],
      ['mfrPartNumber', isBlank(product.mfrPartNumber)], ['nsn', isBlank(product.nsn)],
    ];
    const fields = checks.filter(([, isMissing]) => isMissing).map(([fieldName]) => fieldName);
    if (fields.length === 0) return [];
    const labels = joinWithAnd(fields.map((fieldName) => REQUIRED_FIELD_LABELS[fieldName] ?? fieldName));
    return [createFlag(context, 'MISSING_REQUIRED_FIELD', {
      productId: product.id, rfqNo: productReview.rfqNo, fields,
      title: `Missing ${labels}`,
      detail: `The quote should state ${labels} for ${product.partNumber}, but the extraction has none.`,
      evidence: productReview.source?.headerSpan,
      followUp: `${itemOnly(productReview)}: please confirm ${labels}.`,
    })];
  });
}

// ---------- registry ----------

/** Rules that compare the extraction with the vendor text; skipped when no vendor doc was parsed. */
const EXTRACTION_RULES: Rule[] = [
  droppedValues, valueMismatches, fatMismatches, noBidInventedFields, fieldMismatches, structureIssues,
];

/** Every rule, in section 5.5 table order. */
export const RULES: Rule[] = [
  ...EXTRACTION_RULES,
  noBids, missingQtyBreaks, extraQtyBreaks, alternatesOffered, unrequestedParts, lookalikeParts, nsnMismatches,
  missingPrices, extPriceMismatches, nonUsdCurrency, nreCharges, prepayTerms, minimumOrder, quoteExpired,
  vagueValidity, missingHeaderFields,
  missingCoo, nonUsCoo, noCert, hazmatItems, surplusSources, missingRequiredFields,
];

/** Runs every rule for one vendor; returns unique flags sorted blocker, warning, info (rule order within each). */
export function runRules(context: RuleContext): Flag[] {
  const activeRules = context.source.hasParsedSource
    ? RULES : RULES.filter((rule) => !EXTRACTION_RULES.includes(rule));
  const seenIds = new Set<string>();
  const flags: Flag[] = [];
  for (const rule of activeRules) {
    for (const flag of rule(context)) {
      if (seenIds.has(flag.id)) continue;
      seenIds.add(flag.id);
      flags.push(flag);
    }
  }
  return flags.sort((left, right) => SEVERITY_ORDER.indexOf(left.severity) - SEVERITY_ORDER.indexOf(right.severity));
}
