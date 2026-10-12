// Golden expectations (BUILD_PROMPT section 6) run against the real state.json, plus the behaviors the views
// rely on: evidence spans, follow-up asks, graceful degradation and immutability. Pure domain tests, no clock.
import { describe, expect, it } from 'vitest';
import { rawState } from '../data/rawState';
import { RFQ_SENDER, createEmptyOverlay } from './constants';
import { parseVendorSource } from './parseSource';
import { buildReview } from './review';
import type {
  Category, CompareRow, Flag, Overlay, RawState, RawVendor, ReviewModel, RuleId, VendorReview,
} from './types';

/** The settings every golden number was computed with. */
const GOLDEN_SETTINGS: Overlay['settings'] = { eurUsd: 1.1, asOf: '2026-10-12' };

function goldenOverlay(): Overlay {
  return createEmptyOverlay(GOLDEN_SETTINGS);
}

/** Computes once, on first use, so a failing build fails the tests that use it instead of the whole file. */
function lazy<T>(compute: () => T): () => T {
  let cached: { value: T } | undefined;
  return () => (cached ??= { value: compute() }).value;
}

function rawVendorByPrefix(state: RawState, prefix: string): RawVendor {
  const vendor = state.vendors.find((candidate) => candidate.name.startsWith(prefix));
  if (!vendor) throw new Error(`No raw vendor whose name starts with ${prefix}`);
  return vendor;
}

/** All three vendor reviews, in state order; fails loudly instead of letting a loop pass over nothing. */
function threeVendors(model: ReviewModel): VendorReview[] {
  expect(model.vendors.map((review) => review.vendor.name.split(' ')[0])).toEqual(['Heritage', 'Apex', 'Northstar']);
  return model.vendors;
}

function vendorByPrefix(model: ReviewModel, prefix: string): VendorReview {
  const review = model.vendors.find((candidate) => candidate.vendor.name.startsWith(prefix));
  if (!review) throw new Error(`No vendor review whose name starts with ${prefix}`);
  return review;
}

function requireFlag(review: VendorReview, rule: RuleId): Flag {
  const flag = review.flags.find((candidate) => candidate.rule === rule);
  if (!flag) throw new Error(`${review.vendor.name} has no ${rule} flag`);
  return flag;
}

function findRow(model: ReviewModel, rfqNo: number, qty: number): CompareRow {
  const row = model.compare.find((candidate) => candidate.rfqNo === rfqNo && candidate.qty === qty);
  if (!row) throw new Error(`No compare row #${rfqNo}@${qty}`);
  return row;
}

function productOf(review: VendorReview, flag: Flag) {
  return review.products.find((productReview) => productReview.product.id === flag.productId)?.product;
}

function rfqPartNumber(review: VendorReview, rfqNo: number | undefined): string {
  return review.rfq.items.find((item) => item.no === rfqNo)?.partNumber ?? '?';
}

/** How the golden table writes a flag of one rule. */
type FlagLabel = (review: VendorReview, flag: Flag) => string;
const part: FlagLabel = (review, flag) => `${productOf(review, flag)?.partNumber}`;
const partAtQty: FlagLabel = (review, flag) => `${part(review, flag)}@${flag.qty}`;
const itemAtQty: FlagLabel = (_review, flag) => `#${flag.rfqNo}@${flag.qty}`;
const itemAndPart: FlagLabel = (review, flag) => `#${flag.rfqNo} ${part(review, flag)}`;
const itemAndRfqPart: FlagLabel = (review, flag) => `#${flag.rfqNo} ${rfqPartNumber(review, flag.rfqNo)}`;
const itemPartAtQty: FlagLabel = (review, flag) => `#${flag.rfqNo} ${partAtQty(review, flag)}`;
const partWithCoo: FlagLabel = (review, flag) => `${part(review, flag)} ${productOf(review, flag)?.coo}`;
const vendorLevel: FlagLabel = (_review, flag) =>
  (flag.productId === undefined && flag.rfqNo === undefined && flag.lineId === undefined ? 'vendor' : 'scoped');

function targets(review: VendorReview, rule: RuleId, label: FlagLabel): string[] {
  return review.flags.filter((flag) => flag.rule === rule).map((flag) => label(review, flag)).sort();
}

interface GoldenRow { rule: RuleId; label: FlagLabel; heritage: string[]; apex: string[]; northstar: string[] }

/** Section 6, one entry per rule row: the exact targets per vendor (empty = "none"). */
const GOLDEN_TARGETS: GoldenRow[] = [
  { rule: 'EXTRACTION_DROPPED_VALUE', label: partAtQty, heritage: ['MS27039-1-08@100', 'MS24665-283@60'],
    apex: ['NAS1149F0332P@40'], northstar: ['MS9556-04@192', 'AN3-12A@25'] },
  { rule: 'EXTRACTION_FAT_MISMATCH', label: partAtQty, heritage: ['MS27039-1-08@100'], apex: ['MS27039-1-08@100'],
    northstar: ['MS27039-1-08@100'] },
  { rule: 'EXTRACTION_NOBID_INVENTED_FIELDS', label: part, heritage: ['AN960-10'], apex: ['MS17985C411'],
    northstar: ['AN960-10'] },
  { rule: 'NO_BID', label: itemAndRfqPart, heritage: ['#5 AN960-10'], apex: ['#9 MS17985C411'], northstar: ['#5 AN960-10'] },
  { rule: 'MISSING_QTY_BREAK', label: itemAtQty, heritage: ['#1@250', '#6@150', '#7@192', '#9@15'],
    apex: ['#2@200', '#3@25', '#3@500', '#7@48', '#7@192', '#10@100'],
    northstar: ['#1@250', '#1@500', '#3@250', '#4@50', '#9@30', '#9@90'] },
  { rule: 'EXTRA_QTY_BREAK', label: itemPartAtQty, heritage: [], apex: ['#4 M83248/1-006@25'], northstar: [] },
  { rule: 'ALTERNATE_OFFERED', label: itemAndPart, heritage: ['#2 NAS1149F0832P-ALT'], apex: ['#6 MS35206-228-AC'],
    northstar: ['#8 NAS1351-3H8-NS'] },
  { rule: 'UNREQUESTED_PART', label: part, heritage: ['MS24665-283'], apex: ['NAS1149F0332P'], northstar: ['AN4-7A'] },
  { rule: 'LOOKALIKE_PART', label: part, heritage: [], apex: ['NAS1149F0332P'], northstar: [] },
  { rule: 'MISSING_COO', label: part, heritage: [], apex: [], northstar: ['NAS1149F0832P'] },
  { rule: 'NO_CERT', label: part, heritage: [], apex: [], northstar: ['MS9556-04'] },
  { rule: 'NON_US_COO', label: partWithCoo, heritage: ['M83248/1-006 CA'],
    apex: ['M83248/1-006 MX', 'MS35206-228-AC MX', 'MS9556-04 MX'],
    northstar: ['MS27039-1-08 DE', 'MS21042L3 DE', 'M83248/1-006 DE', 'MS35206-228 DE', 'MS9556-04 DE',
      'MS17985C411 DE', 'AN3-12A DE'] },
  { rule: 'HAZMAT', label: part, heritage: ['M83248/1-006'], apex: ['M83248/1-006'], northstar: ['M83248/1-006'] },
  { rule: 'SURPLUS_SOURCE', label: part, heritage: [], apex: [], northstar: ['NAS1351-3H8-NS'] },
  { rule: 'NRE_CHARGE', label: part, heritage: ['MS27039-1-08'], apex: [], northstar: [] },
  { rule: 'NON_USD_CURRENCY', label: vendorLevel, heritage: [], apex: [], northstar: ['vendor'] },
  { rule: 'PREPAY_TERMS', label: vendorLevel, heritage: [], apex: [], northstar: ['vendor'] },
  { rule: 'MIN_ORDER', label: vendorLevel, heritage: [], apex: ['vendor'], northstar: [] },
  { rule: 'VALIDITY_AMBIGUOUS', label: vendorLevel, heritage: [], apex: [], northstar: ['vendor'] },
  { rule: 'QUOTE_EXPIRED', label: vendorLevel, heritage: ['vendor'], apex: ['vendor'], northstar: ['vendor'] },
];

/** Rules that must not fire for any vendor on this data. */
const SILENT_RULES: RuleId[] = [
  'NSN_MISMATCH', 'EXT_PRICE_MISMATCH', 'EXTRACTION_VALUE_MISMATCH', 'EXTRACTION_FIELD_MISMATCH',
  'EXTRACTION_STRUCTURE', 'MISSING_PRICE', 'MISSING_HEADER_FIELD', 'MISSING_REQUIRED_FIELD',
];

/** The category of every rule, by its row group in section 5.5. */
const CATEGORY_OF: Record<RuleId, Category> = {
  EXTRACTION_DROPPED_VALUE: 'extraction', EXTRACTION_VALUE_MISMATCH: 'extraction',
  EXTRACTION_FAT_MISMATCH: 'extraction', EXTRACTION_NOBID_INVENTED_FIELDS: 'extraction',
  EXTRACTION_FIELD_MISMATCH: 'extraction', EXTRACTION_STRUCTURE: 'extraction',
  NO_BID: 'coverage', MISSING_QTY_BREAK: 'coverage', EXTRA_QTY_BREAK: 'coverage', ALTERNATE_OFFERED: 'coverage',
  UNREQUESTED_PART: 'coverage', LOOKALIKE_PART: 'coverage', NSN_MISMATCH: 'coverage',
  MISSING_PRICE: 'commercial', EXT_PRICE_MISMATCH: 'commercial', NON_USD_CURRENCY: 'commercial',
  NRE_CHARGE: 'commercial', PREPAY_TERMS: 'commercial', MIN_ORDER: 'commercial', QUOTE_EXPIRED: 'commercial',
  VALIDITY_AMBIGUOUS: 'commercial', MISSING_HEADER_FIELD: 'commercial',
  MISSING_COO: 'compliance', NON_US_COO: 'compliance', NO_CERT: 'compliance', HAZMAT: 'compliance',
  SURPLUS_SOURCE: 'compliance', MISSING_REQUIRED_FIELD: 'compliance',
};

/** Writes every open fix into the overlay the way the store does (merge), until none is left. */
function applyEveryFix(): { model: ReviewModel; overlay: Overlay } {
  let overlay = goldenOverlay();
  let model = buildReview(rawState, overlay);
  for (let round = 0; round < 5; round += 1) {
    const fixes = model.vendors.flatMap((review) => review.open).flatMap((flag) => (flag.fix ? [flag.fix] : []));
    if (fixes.length === 0) break;
    const lineOverrides = { ...overlay.lineOverrides };
    for (const fix of fixes) {
      const values = fix.kind === 'apply-source-line' ? fix.values : { isFat: fix.isFat };
      lineOverrides[fix.lineId] = { ...lineOverrides[fix.lineId], ...values };
    }
    overlay = { ...overlay, lineOverrides };
    model = buildReview(rawState, overlay);
  }
  return { model, overlay };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const initialModel = lazy(() => buildReview(rawState, goldenOverlay()));
const fixedModel = lazy(() => applyEveryFix().model);

describe('golden rule targets on an empty overlay', () => {
  it.each(GOLDEN_TARGETS)('$rule fires on exactly the golden targets', ({ rule, label, heritage, apex, northstar }) => {
    const model = initialModel();
    expect(targets(vendorByPrefix(model, 'Heritage'), rule, label)).toEqual([...heritage].sort());
    expect(targets(vendorByPrefix(model, 'Apex'), rule, label)).toEqual([...apex].sort());
    expect(targets(vendorByPrefix(model, 'Northstar'), rule, label)).toEqual([...northstar].sort());
  });

  it.each(SILENT_RULES)('%s fires for no vendor', (rule) => {
    for (const review of threeVendors(initialModel())) expect(targets(review, rule, part)).toEqual([]);
  });
});

describe('golden flag details', () => {
  it('offers the values written in the vendor text as the fix for every dropped value', () => {
    const fixLabel: FlagLabel = (review, flag) => {
      const values = flag.fix?.kind === 'apply-source-line' ? flag.fix.values : undefined;
      return `${partAtQty(review, flag)} ${values?.currency} ${values?.unitCost.toFixed(2)} / `
        + `${values?.price.toFixed(2)} / ${values?.leadTime}d`;
    };
    const model = initialModel();
    expect(targets(vendorByPrefix(model, 'Heritage'), 'EXTRACTION_DROPPED_VALUE', fixLabel)).toEqual([
      'MS24665-283@60 USD 5.99 / 359.40 / 87d', 'MS27039-1-08@100 USD 1.74 / 174.00 / 18d']);
    expect(targets(vendorByPrefix(model, 'Apex'), 'EXTRACTION_DROPPED_VALUE', fixLabel)).toEqual([
      'NAS1149F0332P@40 USD 6.65 / 266.00 / 85d']);
    expect(targets(vendorByPrefix(model, 'Northstar'), 'EXTRACTION_DROPPED_VALUE', fixLabel)).toEqual([
      'AN3-12A@25 EUR 7.65 / 191.25 / 86d', 'MS9556-04@192 EUR 4.60 / 883.20 / 95d']);
  });

  it('sets FAT from the vendor text: on for Heritage, off where the PDF and rev 3 are silent', () => {
    const fatLabel: FlagLabel = (review, flag) =>
      `${partAtQty(review, flag)} ${flag.fix?.kind === 'set-fat' ? String(flag.fix.isFat) : 'no fix'}`;
    const model = initialModel();
    expect(targets(vendorByPrefix(model, 'Heritage'), 'EXTRACTION_FAT_MISMATCH', fatLabel)).toEqual(['MS27039-1-08@100 true']);
    expect(targets(vendorByPrefix(model, 'Apex'), 'EXTRACTION_FAT_MISMATCH', fatLabel)).toEqual(['MS27039-1-08@100 false']);
    expect(targets(vendorByPrefix(model, 'Northstar'), 'EXTRACTION_FAT_MISMATCH', fatLabel)).toEqual(['MS27039-1-08@100 false']);
  });

  it('lists the fields the extraction invented for each no-bid part', () => {
    const allSeven = ['certifications', 'coo', 'hazmatItem', 'mfrCage', 'mfrPartNumber', 'packagingIncluded', 'shippingIncluded'];
    const model = initialModel();
    const fieldsOf = (prefix: string) =>
      [...(requireFlag(vendorByPrefix(model, prefix), 'EXTRACTION_NOBID_INVENTED_FIELDS').fields ?? [])].sort();
    expect(fieldsOf('Heritage')).toEqual(allSeven);
    expect(fieldsOf('Apex')).toEqual(allSeven);
    expect(fieldsOf('Northstar')).toEqual(['certifications', 'mfrCage', 'mfrPartNumber']);
  });

  it('asks for the superseding PN only when the no-bid note says superseded', () => {
    const model = initialModel();
    expect(requireFlag(vendorByPrefix(model, 'Northstar'), 'NO_BID').followUp).toContain('superseding PN');
    expect(requireFlag(vendorByPrefix(model, 'Heritage'), 'NO_BID').followUp).not.toContain('supersed');
    expect(requireFlag(vendorByPrefix(model, 'Apex'), 'NO_BID').followUp).not.toContain('supersed');
    expect(requireFlag(vendorByPrefix(model, 'Heritage'), 'NO_BID').detail).toContain('No bid.');
  });

  it('flags the Apex lookalike by PN and NSN without tying it to an RFQ item', () => {
    const lookalike = requireFlag(vendorByPrefix(initialModel(), 'Apex'), 'LOOKALIKE_PART');
    expect(lookalike.rfqNo).toBeUndefined();
    expect(lookalike.followUp).toContain('NAS1149F0832P');
    expect(lookalike.detail).toContain('AN960-10');
  });

  it('states the country, NRE amount, minimum order and vague validity in the details', () => {
    const model = initialModel();
    expect(requireFlag(vendorByPrefix(model, 'Heritage'), 'NON_US_COO').detail).toContain('Buy American / DFARS');
    expect(requireFlag(vendorByPrefix(model, 'Heritage'), 'NRE_CHARGE').detail).toContain('285');
    expect(requireFlag(vendorByPrefix(model, 'Apex'), 'MIN_ORDER').detail).toContain('250');
    const validity = requireFlag(vendorByPrefix(model, 'Northstar'), 'VALIDITY_AMBIGUOUS');
    expect(validity.detail).toContain('end of June');
    expect(validity.followUp).toContain('(you wrote "end of June")');
  });

  it('dates validity from the reply and marks every quote expired as of 2026-10-12', () => {
    const model = initialModel();
    const expected = { Heritage: '2026-06-13', Apex: '2026-06-29', Northstar: '2026-06-25' };
    for (const [prefix, validUntil] of Object.entries(expected)) {
      const review = vendorByPrefix(model, prefix);
      expect(review.validUntil).toBe(validUntil);
      expect(review.expired).toBe(true);
      expect(requireFlag(review, 'QUOTE_EXPIRED').followUp).toContain(validUntil);
    }
  });
});

describe('golden coverage, counts and follow-up checks', () => {
  it('counts parts and breaks quoted', () => {
    const model = initialModel();
    expect(vendorByPrefix(model, 'Heritage').coverage).toEqual({ partsQuoted: 9, parts: 10, breaksQuoted: 20, breaks: 27 });
    expect(vendorByPrefix(model, 'Apex').coverage).toEqual({ partsQuoted: 9, parts: 10, breaksQuoted: 18, breaks: 27 });
    expect(vendorByPrefix(model, 'Northstar').coverage).toEqual({ partsQuoted: 9, parts: 10, breaksQuoted: 18, breaks: 27 });
  });

  it('counts open flags by severity', () => {
    const model = initialModel();
    expect(vendorByPrefix(model, 'Heritage').counts).toEqual({ blocker: 3, warning: 9, info: 3 });
    expect(vendorByPrefix(model, 'Apex').counts).toEqual({ blocker: 2, warning: 14, info: 4 });
    expect(vendorByPrefix(model, 'Northstar').counts).toEqual({ blocker: 5, warning: 20, info: 3 });
  });

  it('finds the draft asks the vendor already answered', () => {
    const model = initialModel();
    expect(vendorByPrefix(model, 'Heritage').followUp.staleAsks).toEqual([
      'Payment terms - already given: NET 30', 'Shipping on item 1 - already given: not included']);
    expect(vendorByPrefix(model, 'Apex').followUp.staleAsks).toEqual([
      'Quote validity - already given: 45 days', 'COO for item 4 - already given: MX']);
    expect(vendorByPrefix(model, 'Northstar').followUp.staleAsks).toEqual([
      'Payment terms - already given: Prepay first order, then NET 15', 'Quote validity - already given: 40 days']);
  });

  it('finds the open asks the draft forgot', () => {
    const missedLabels = (review: VendorReview) => review.followUp.missedFlagIds.map((flagId) => {
      const flag = review.flags.find((candidate) => candidate.id === flagId);
      if (!flag) return `unknown ${flagId}`;
      if (flag.rule === 'MISSING_QTY_BREAK') return `break ${partAtQty(review, flag)}`;
      return `${flag.rule} ${flag.productId === undefined ? 'vendor' : part(review, flag)}`;
    });
    const model = initialModel();
    const heritageMissed = missedLabels(vendorByPrefix(model, 'Heritage'));
    expect(heritageMissed).toEqual(expect.arrayContaining([
      'break MS35206-228@150', 'break MS9556-04@192', 'break MS17985C411@15']));
    expect(heritageMissed).not.toContain('break MS27039-1-08@250');
    expect(missedLabels(vendorByPrefix(model, 'Apex'))).toEqual(expect.arrayContaining([
      'break MS21042L3@25', 'break MS21042L3@500', 'break MS9556-04@48', 'break MS9556-04@192', 'break AN3-12A@100',
      'LOOKALIKE_PART NAS1149F0332P']));
    expect(missedLabels(vendorByPrefix(model, 'Northstar'))).toEqual(expect.arrayContaining([
      'break MS27039-1-08@250', 'break MS27039-1-08@500', 'break MS21042L3@250', 'break M83248/1-006@50',
      'break MS17985C411@30', 'break MS17985C411@90', 'NO_CERT MS9556-04', 'NON_USD_CURRENCY vendor']));
  });
});

describe('golden source documents', () => {
  it('reads Northstar from the rev 3 email and never from the rev 2 history', () => {
    const parsed = parseVendorSource(rawVendorByPrefix(rawState, 'Northstar'));
    const quoteDocs = parsed.docs.filter((doc) => doc.role === 'quote');
    expect(quoteDocs.map((doc) => doc.subject)).toEqual(['Fwd: RE: Argus list -- rev 3 clean-ish']);
    expect(quoteDocs[0].historyStart).toBeGreaterThan(0);
    expect(parsed.docs.find((doc) => doc.date === '2026-05-16T01:38:00Z')?.role).toBe('no-quote');
    const unitCosts = parsed.items.flatMap((item) => item.lines.map((line) => line.unitCost));
    expect(unitCosts).not.toContain(2.11);
    expect(unitCosts).not.toContain(3.9);
  });

  it('labels where each quote came from and when it was sent', () => {
    const model = initialModel();
    expect(vendorByPrefix(model, 'Heritage').sourceLabel).toBe('Inline email');
    expect(vendorByPrefix(model, 'Apex').sourceLabel).toBe('PDF attachment');
    expect(vendorByPrefix(model, 'Northstar').sourceLabel).toBe('Forwarded chain · rev 3');
    expect(vendorByPrefix(model, 'Apex').docs.filter((doc) => doc.role === 'no-quote')).toHaveLength(1);
    expect(vendorByPrefix(model, 'Northstar').respondedAt).toBe('2026-05-16T13:04:00Z');
    for (const review of threeVendors(model)) expect(review.hasParsedSource).toBe(true);
  });

  it('anchors every RFQ item span on its own item line', () => {
    const heritage = vendorByPrefix(initialModel(), 'Heritage');
    const rfqDoc = heritage.docs.find((doc) => doc.key === heritage.rfq.docKey);
    expect(rfqDoc?.role).toBe('rfq');
    expect(heritage.rfq.items).toHaveLength(10);
    expect(heritage.rfq.items.flatMap((item) => item.qtys)).toHaveLength(27);
    expect(heritage.rfq.dueDate).toBe('2026-05-20');
    for (const item of heritage.rfq.items) {
      expect(rfqDoc?.text.slice(item.span.start, item.span.end)).toMatch(new RegExp(`^${item.no}\\. ${item.partNumber}`));
    }
  });
});

describe('golden compare before any fix', () => {
  it('leaves #1@100, #2@200 and #7@192 without a best vendor', () => {
    const model = initialModel();
    expect(model.compare).toHaveLength(27);
    expect(model.compare.filter((row) => !row.bestVendorId).map((row) => `#${row.rfqNo}@${row.qty}`))
      .toEqual(['#1@100', '#2@200', '#7@192']);
    const firstRowTrust = Object.values(findRow(model, 1, 100).cells).map((cell) => cell?.trust);
    expect(firstRowTrust).toEqual(['open-issue', 'open-issue', 'open-issue']);
  });

  it('awards Heritage #1@500 at 1.62 although a sibling line is blocked', () => {
    const model = initialModel();
    const heritageId = vendorByPrefix(model, 'Heritage').vendor.id;
    const row = findRow(model, 1, 500);
    expect(row.bestVendorId).toBe(heritageId);
    expect(row.cells[heritageId]?.usd).toBeCloseTo(1.62);
  });
});

describe('golden results after applying every fix', () => {
  it('clears every extraction blocker', () => {
    for (const review of threeVendors(fixedModel())) {
      expect(review.open.filter((flag) => flag.rule.startsWith('EXTRACTION_') && flag.severity === 'blocker')).toEqual([]);
    }
  });

  it('restores Heritage MS27039-1-08@100 from the email and marks it corrected', () => {
    const model = fixedModel();
    const heritage = vendorByPrefix(model, 'Heritage');
    const lineReview = heritage.products.find((productReview) => productReview.product.partNumber === 'MS27039-1-08')
      ?.lines.find((candidate) => candidate.line.quantity === 100);
    expect(lineReview?.line.unitCost).toBeCloseTo(1.74);
    expect(lineReview?.line.price).toBeCloseTo(174);
    expect(lineReview?.line).toMatchObject({ currency: 'USD', leadTime: 18, isFat: true });
    expect(findRow(model, 1, 100).cells[heritage.vendor.id]?.trust).toBe('corrected');
  });

  it('lets Heritage and Apex submit while Northstar keeps its COO and cert blockers', () => {
    const model = fixedModel();
    expect(vendorByPrefix(model, 'Heritage').canSubmit).toBe(true);
    expect(vendorByPrefix(model, 'Apex').canSubmit).toBe(true);
    const northstar = vendorByPrefix(model, 'Northstar');
    expect(northstar.canSubmit).toBe(false);
    expect(northstar.open.filter((flag) => flag.severity === 'blocker').map((flag) => flag.rule).sort())
      .toEqual(['MISSING_COO', 'NO_CERT']);
  });

  it('picks the cheapest eligible vendor per row', () => {
    const model = fixedModel();
    const rowsWonBy = (vendorId: string | undefined) => model.compare
      .filter((row) => row.bestVendorId === vendorId).map((row) => `#${row.rfqNo}@${row.qty}`);
    expect(rowsWonBy(vendorByPrefix(model, 'Heritage').vendor.id)).toHaveLength(18);
    expect(rowsWonBy(vendorByPrefix(model, 'Apex').vendor.id)).toEqual(['#1@250', '#2@50', '#5@5', '#5@25', '#5@100']);
    expect(rowsWonBy(vendorByPrefix(model, 'Northstar').vendor.id)).toEqual(['#6@150', '#9@15']);
    expect(rowsWonBy(undefined)).toEqual(['#2@200', '#7@192']);
  });

  it('drafts one PO per winning vendor at the default quantities', () => {
    const model = fixedModel();
    const draftOf = (prefix: string) => model.po.drafts.find((draft) => draft.vendorId === vendorByPrefix(model, prefix).vendor.id);
    const heritage = draftOf('Heritage');
    expect(heritage?.lines.map((line) => line.rfqNo)).toEqual([1, 3, 4, 6, 7, 8, 10]);
    expect(heritage?.currency).toBe('USD');
    expect(heritage?.partsTotal).toBeCloseTo(883.82);
    expect(heritage?.oneTimeCharges).toEqual([{ label: 'NRE MS27039-1-08', amount: 285 }]);
    expect(heritage?.subtotal).toBeCloseTo(1168.82);
    const apex = draftOf('Apex');
    expect(apex?.lines.map((line) => line.rfqNo)).toEqual([2, 5]);
    expect(apex?.partsTotal).toBeCloseTo(140.15);
    expect(apex?.minimumOrderUsd).toBe(250);
    expect(apex?.isBelowMinimum).toBe(true);
    const northstar = draftOf('Northstar');
    expect(northstar?.lines.map((line) => line.rfqNo)).toEqual([9]);
    expect(northstar?.currency).toBe('EUR');
    expect(northstar?.partsTotal).toBeCloseTo(105.6);
    expect(northstar?.subtotalUsd).toBeCloseTo(116.16);
    expect(model.po.unsourced).toEqual([]);
  });
});

describe('flags the views can rely on', () => {
  it('points every flag at real source text', () => {
    for (const review of threeVendors(initialModel())) {
      for (const flag of review.flags) {
        const doc = review.docs.find((candidate) => candidate.key === flag.evidence?.docKey);
        const quoted = doc?.text.slice(flag.evidence?.start, flag.evidence?.end).trim() ?? '';
        expect(quoted, `${flag.id} has no evidence`).not.toBe('');
      }
    }
  });

  it('gives every flag a unique id within its vendor', () => {
    for (const review of threeVendors(initialModel())) {
      const flagIds = review.flags.map((flag) => flag.id);
      expect(new Set(flagIds).size).toBe(flagIds.length);
    }
  });

  it('files every rule under its section 5.5 category', () => {
    for (const review of threeVendors(initialModel())) {
      for (const flag of review.flags) expect(flag.category, flag.id).toBe(CATEGORY_OF[flag.rule]);
    }
  });

  it('makes a blocked cell eligible once its blocker is accepted with a note', () => {
    const northstar = vendorByPrefix(initialModel(), 'Northstar');
    expect(findRow(initialModel(), 7, 12).cells[northstar.vendor.id]?.eligible).toBe(false);
    const noCert = requireFlag(northstar, 'NO_CERT');
    const overlay: Overlay = { ...goldenOverlay(),
      decisions: { [noCert.id]: { status: 'accepted', note: 'C of C waived by customer', at: '2026-10-12T09:00:00Z' } } };
    expect(findRow(buildReview(rawState, overlay), 7, 12).cells[northstar.vendor.id]?.eligible).toBe(true);
  });
});

describe('follow-up email', () => {
  it('opens with the reply subject and the contact first name, then items in RFQ order, then General', () => {
    const email = vendorByPrefix(initialModel(), 'Heritage').followUp.generated;
    expect(email.startsWith('Subject: Re: RFQ - 10 parts due 5/20 - follow-up')).toBe(true);
    expect(email).toContain('Hi Mike,');
    const headingOffsets = ['Item 1 · MS27039-1-08', 'Item 2 · NAS1149F0832P', 'Item 5 · AN960-10', 'General']
      .map((heading) => email.indexOf(heading));
    expect(headingOffsets.every((offset) => offset >= 0)).toBe(true);
    expect([...headingOffsets].sort((left, right) => left - right)).toEqual(headingOffsets);
  });

  it('groups the missing breaks of one item into a single ask', () => {
    const itemThreeAsks = vendorByPrefix(initialModel(), 'Apex').followUp.asks?.filter((ask) => ask.rfqNo === 3) ?? [];
    expect(itemThreeAsks).toHaveLength(1);
    expect(itemThreeAsks[0].section).toBe('Item 3 · MS21042L3');
    expect(itemThreeAsks[0].flagIds).toHaveLength(2);
    expect(itemThreeAsks[0].text).toBe('Item 3 MS21042L3: please add the 25 and 500 pc breaks (we requested 25/100/250/500).');
  });

  it('leaves unticked asks out of the email but keeps them listed as excluded', () => {
    const expired = requireFlag(vendorByPrefix(initialModel(), 'Heritage'), 'QUOTE_EXPIRED');
    const overlay: Overlay = { ...goldenOverlay(), followUpExcluded: { [expired.id]: true } };
    const heritage = vendorByPrefix(buildReview(rawState, overlay), 'Heritage');
    expect(heritage.followUp.generated).not.toContain('validity ended');
    expect(heritage.followUp.asks?.find((ask) => ask.flagIds.includes(expired.id))?.excluded).toBe(true);
    expect(heritage.followUp.missedFlagIds).not.toContain(expired.id);
  });
});

describe('messy data and immutability', () => {
  it('marks every line unverified when a vendor reply has no parseable items', () => {
    const messyState = structuredClone(rawState);
    for (const email of rawVendorByPrefix(messyState, 'Heritage').emails) {
      if (email.from !== RFQ_SENDER) email.body = 'Pricing to follow next week.';
    }
    const heritage = vendorByPrefix(buildReview(messyState, goldenOverlay()), 'Heritage');
    expect(heritage.hasParsedSource).toBe(false);
    expect(heritage.flags.filter((flag) => flag.rule.startsWith('EXTRACTION_'))).toEqual([]);
    expect(heritage.products.flatMap((productReview) => productReview.lines).map((lineReview) => lineReview.status))
      .not.toContain('verified');
    expect(heritage.products.flatMap((productReview) => productReview.lines)
      .every((lineReview) => lineReview.status === 'unverified')).toBe(true);
  });

  it('never throws when a vendor email is malformed', () => {
    const brokenState = structuredClone(rawState);
    const apexReply = rawVendorByPrefix(brokenState, 'Apex').emails[1];
    apexReply.body = null as unknown as string;
    apexReply.attachments = [{ id: 'broken', filename: 'broken.pdf', pages: [undefined as unknown as string] }];
    expect(() => buildReview(brokenState, goldenOverlay())).not.toThrow();
    expect(vendorByPrefix(buildReview(brokenState, goldenOverlay()), 'Apex').hasParsedSource).toBe(false);
  });

  it('never mutates the state or the overlay', () => {
    const frozenState = deepFreeze(structuredClone(rawState));
    const frozenOverlay = deepFreeze(applyEveryFix().overlay);
    expect(threeVendors(buildReview(frozenState, frozenOverlay))).toHaveLength(3);
  });
});
