// Turns one vendor's email thread into readable source docs with roles, parses its RFQ copy and the item
// blocks of the current quote. Never throws (hasParsedSource is false on failure); never mutates the vendor.

import {
  COO_NOT_STATED, DESCRIPTION_PATTERN, FAT_PATTERN, FORWARDED_SUBJECT_PATTERN, ITEM_HEADER_PATTERN,
  MANUFACTURER_PATTERN, NO_QUOTE_MARKER, NOTE_PATTERN, NRE_NONE_STATED, NSN_PATTERN, REVISION_PATTERN,
  RFQ_SENDER, SOURCE_LINE_PATTERN, TERMS_PATTERN,
} from './constants';
import type { ParsedSource } from './context';
import { createEmptyRfq, parseRfq } from './parseRfq';
import { emailDomain, parsedText, textOf } from './text';
import type { DocRole, RawVendor, SourceDoc, SourceItem, SourceLine, Span } from './types';

/** '-----Original Message-----' on a line of its own; [ \t] keeps the match on that line (section 11, item 5). */
const HISTORY_LINE_PATTERN = /^-{3,}[ \t]*Original Message[ \t]*-{3,}[ \t]*$/m;

/** Role every doc starts with until roles are assigned. */
const PENDING_ROLE: DocRole = 'no-quote';

/** Source label when no vendor doc yielded item blocks. */
export const NO_PARSABLE_QUOTE_LABEL = 'No parsable quote';

/** A doc with the item blocks found in its parsed region. */
interface DocWithItems { doc: SourceDoc; items: SourceItem[] }

function asList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function isRfqDoc(doc: SourceDoc): boolean {
  return doc.from.trim().toLowerCase() === RFQ_SENDER;
}

function isFromDomain(doc: SourceDoc, domain: string): boolean {
  return domain !== '' && emailDomain(doc.from) === domain;
}

function withHistoryStart(doc: SourceDoc): SourceDoc {
  const historyStart = doc.text.search(HISTORY_LINE_PATTERN);
  return historyStart < 0 ? doc : { ...doc, historyStart };
}

/** One doc per email body and one per attachment page, in thread order, with text coerced to strings. */
function buildDocs(vendor: RawVendor): SourceDoc[] {
  const docs: SourceDoc[] = [];
  for (const email of asList(vendor.emails)) {
    if (!email || typeof email !== 'object') continue;
    const emailId = String(email.id ?? '');
    const shared = {
      emailId, role: PENDING_ROLE, from: textOf(email.from), fromName: textOf(email.fromName),
      date: textOf(email.date), subject: textOf(email.subject),
    };
    docs.push(withHistoryStart({ ...shared, key: emailId, text: textOf(email.body) }));
    for (const attachment of asList(email.attachments)) {
      if (!attachment || typeof attachment !== 'object') continue;
      const attachmentId = String(attachment.id ?? '');
      asList(attachment.pages).forEach((pageText, pageIndex) => {
        docs.push(withHistoryStart({
          ...shared, key: `${emailId}:${attachmentId}:${pageIndex}`, text: textOf(pageText),
          attachment: { id: attachmentId, filename: textOf(attachment.filename), page: pageIndex + 1 },
        }));
      });
    }
  }
  return docs;
}

/** Parses one item block: header, NSN, description, manufacturer, terms, note and quantity lines. */
function parseItemBlock(docKey: string, header: RegExpMatchArray, blockText: string, blockStart: number): SourceItem {
  const spanAt = (offset: number, length: number): Span =>
    ({ docKey, start: blockStart + offset, end: blockStart + offset + length });
  const item: SourceItem = {
    no: Number(header[1]), partNumber: header[2] ?? '', extraStock: Boolean(header[4]),
    noBid: blockText.includes(NO_QUOTE_MARKER), lines: [],
    span: spanAt(0, blockText.length), headerSpan: spanAt(0, header[0].length),
  };
  if (header[3]) item.altFor = header[3];
  const nsnMatch = blockText.match(NSN_PATTERN);
  if (nsnMatch) item.nsn = nsnMatch[1] ?? '';
  const descriptionMatch = blockText.match(DESCRIPTION_PATTERN);
  if (descriptionMatch) item.description = descriptionMatch[1] ?? '';
  const manufacturerMatch = blockText.match(MANUFACTURER_PATTERN);
  if (manufacturerMatch) {
    item.mfrPartNumber = manufacturerMatch[1] ?? '';
    item.mfrCage = manufacturerMatch[2] ?? '';
    item.coo = manufacturerMatch[3] === COO_NOT_STATED ? null : (manufacturerMatch[3] ?? '');
    item.hazmat = manufacturerMatch[4] === 'yes';
  }
  const termsMatch = blockText.match(TERMS_PATTERN);
  if (termsMatch) {
    const nreText = (termsMatch[4] ?? '').trim();
    item.packagingIncluded = !termsMatch[1];
    item.shippingIncluded = !termsMatch[2];
    item.certifications = termsMatch[3] ?? '';
    item.nreCost = nreText === NRE_NONE_STATED ? null : Number(nreText);
  }
  const noteMatch = blockText.match(NOTE_PATTERN);
  if (noteMatch) {
    item.note = noteMatch[1] ?? '';
    item.noteSpan = spanAt(noteMatch.index ?? 0, noteMatch[0].length);
  }
  const isFatNote = item.note !== undefined && FAT_PATTERN.test(item.note);
  item.lines = [...blockText.matchAll(SOURCE_LINE_PATTERN)].map((lineMatch, lineIndex): SourceLine => ({
    qty: Number(lineMatch[1]), currency: lineMatch[2] ?? '', unitCost: Number(lineMatch[3]),
    price: Number(lineMatch[4]), leadTime: Number(lineMatch[5]), isFat: isFatNote && lineIndex === 0,
    span: spanAt(lineMatch.index ?? 0, lineMatch[0].length),
  }));
  return item;
}

/** Item blocks in the parsed region of a doc (text before historyStart only). */
function parseDocItems(doc: SourceDoc): SourceItem[] {
  const region = parsedText(doc);
  const headers = [...region.matchAll(ITEM_HEADER_PATTERN)];
  return headers.map((header, index) => {
    const blockStart = header.index ?? 0;
    const nextHeader = headers[index + 1];
    const blockEnd = nextHeader ? (nextHeader.index ?? region.length) : region.length;
    return parseItemBlock(doc.key, header, region.slice(blockStart, blockEnd), blockStart);
  });
}

function roleOf(entry: DocWithItems, vendorDomain: string, latestDate: string): DocRole {
  if (isRfqDoc(entry.doc)) return 'rfq';
  if (!isFromDomain(entry.doc, vendorDomain) || entry.items.length === 0) return 'no-quote';
  return entry.doc.date === latestDate ? 'quote' : 'superseded';
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** RFQ docs first, then everything else by date; ties keep thread order (the sort is stable). */
function byRfqFirstThenDate(left: DocWithItems, right: DocWithItems): number {
  const rank = (entry: DocWithItems): number => (entry.doc.role === 'rfq' ? 0 : 1);
  return rank(left) - rank(right) || compareText(left.doc.date, right.doc.date);
}

function sourceLabelOf(quoteDocs: SourceDoc[]): string {
  const firstQuote = quoteDocs[0];
  if (!firstQuote) return NO_PARSABLE_QUOTE_LABEL;
  if (quoteDocs.some((doc) => doc.attachment !== undefined)) return 'PDF attachment';
  const revisionMatch = firstQuote.subject.match(REVISION_PATTERN);
  if (FORWARDED_SUBJECT_PATTERN.test(firstQuote.subject) && revisionMatch) {
    return `Forwarded chain · rev ${revisionMatch[1] ?? ''}`;
  }
  return 'Inline email';
}

/** Parses one vendor thread into docs with roles, the vendor's RFQ copy and the current quote's items; never throws. */
export function parseVendorSource(vendor: RawVendor): ParsedSource {
  const parsed: ParsedSource = {
    docs: [], rfq: createEmptyRfq(), quoteDocs: [], items: [], respondedAt: '',
    sourceLabel: NO_PARSABLE_QUOTE_LABEL, hasParsedSource: false,
  };
  try {
    const builtDocs = buildDocs(vendor);
    const rfqDoc = builtDocs.find((doc) => isRfqDoc(doc) && doc.attachment === undefined);
    if (rfqDoc) parsed.rfq = parseRfq({ ...rfqDoc, role: 'rfq' });
    const vendorDomain = emailDomain(vendor.contactEmail);
    const entries: DocWithItems[] = builtDocs.map((doc) => ({
      doc, items: !isRfqDoc(doc) && isFromDomain(doc, vendorDomain) ? parseDocItems(doc) : [],
    }));
    const latestDate = entries.reduce(
      (latest, entry) => (entry.items.length > 0 && entry.doc.date > latest ? entry.doc.date : latest), '');
    const ordered = entries
      .map((entry) => ({ doc: { ...entry.doc, role: roleOf(entry, vendorDomain, latestDate) }, items: entry.items }))
      .sort(byRfqFirstThenDate);
    const quoteEntries = ordered.filter((entry) => entry.doc.role === 'quote');
    parsed.docs = ordered.map((entry) => entry.doc);
    parsed.quoteDocs = quoteEntries.map((entry) => entry.doc);
    parsed.items = quoteEntries.flatMap((entry) => entry.items);
    parsed.respondedAt = parsed.quoteDocs[0]?.date ?? '';
    parsed.sourceLabel = sourceLabelOf(parsed.quoteDocs);
    parsed.hasParsedSource = parsed.items.length > 0;
    return parsed;
  } catch {
    return {
      ...parsed, quoteDocs: [], items: [], respondedAt: '', sourceLabel: NO_PARSABLE_QUOTE_LABEL, hasParsedSource: false,
    };
  }
}
