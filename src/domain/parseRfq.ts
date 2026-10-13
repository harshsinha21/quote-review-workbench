// Parses the customer's RFQ email (one vendor's copy) into numbered items, quantity breaks and a due date.
// Pure: reads only the doc it is given, never throws, never reads the clock (the year comes from the email date).

import { DUE_DATE_PATTERN } from './constants';
import type { Rfq, RfqItem, SourceDoc } from './types';

/**
 * One RFQ item line: "1. MS27039-1-08 | NSN 5305-00-984-6210 | requested qty breaks 100/250/500". [ \t] instead
 * of \s, so under the m flag a match never starts on the line above (BUILD_PROMPT section 11, item 5).
 * Global: use only through matchAll.
 */
const RFQ_ITEM_LINE_PATTERN =
  /^[ \t]*(\d+)\.[ \t]+(\S+)[ \t]*\|[ \t]*NSN[ \t]+(\S+)[ \t]*\|[ \t]*requested qty breaks[ \t]+([\d/]+)[ \t]*$/gm;

/** The four-digit year at the start of an ISO date-time. */
const YEAR_PREFIX_PATTERN = /^\d{4}/;

/** An RFQ with no items, for a thread without an RFQ email or a failed parse. */
export function createEmptyRfq(): Rfq {
  return { docKey: '', subject: '', sentAt: '', items: [] };
}

/** "Need pricing by 5/20" as YYYY-MM-DD, taking the year from the RFQ email's date. */
function parseDueDate(text: string, sentAt: string): string | undefined {
  const dueMatch = text.match(DUE_DATE_PATTERN);
  const yearMatch = YEAR_PREFIX_PATTERN.exec(sentAt);
  if (!dueMatch || !yearMatch) return undefined;
  const month = (dueMatch[1] ?? '').padStart(2, '0');
  const day = (dueMatch[2] ?? '').padStart(2, '0');
  return `${yearMatch[0]}-${month}-${day}`;
}

/** Parses the RFQ doc into items (each span starts at the item number) and its due date. */
export function parseRfq(doc: SourceDoc): Rfq {
  const text = typeof doc.text === 'string' ? doc.text : '';
  const items: RfqItem[] = [];
  for (const match of text.matchAll(RFQ_ITEM_LINE_PATTERN)) {
    const lineText = match[0];
    const lineStart = match.index ?? 0;
    const start = lineStart + (lineText.length - lineText.trimStart().length);
    const end = lineStart + lineText.trimEnd().length;
    items.push({
      no: Number(match[1]),
      partNumber: match[2] ?? '',
      nsn: match[3] ?? '',
      qtys: (match[4] ?? '').split('/').filter((part) => part !== '').map(Number),
      span: { docKey: doc.key, start, end },
    });
  }
  const sentAt = typeof doc.date === 'string' ? doc.date : '';
  const rfq: Rfq = { docKey: doc.key, subject: typeof doc.subject === 'string' ? doc.subject : '', sentAt, items };
  const dueDate = parseDueDate(text, sentAt);
  if (dueDate) rfq.dueDate = dueDate;
  return rfq;
}
