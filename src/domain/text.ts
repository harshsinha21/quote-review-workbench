// Small pure helpers for part numbers, regex escaping, source spans and UTC dates, shared by the domain modules.
// Must not read the clock, mutate its inputs or throw on messy input.

import type { SourceDoc, Span } from './types';

/** YYYY-MM-DD at the start of an ISO date or date-time. Not global, so exec is safe. */
const ISO_DATE_PREFIX_PATTERN = /^\s*(\d{4})-(\d{2})-(\d{2})/;

/** Trims and uppercases a part number so " ms21042l3" and "MS21042L3" compare equal. */
export function normalizePartNumber(pn: string): string {
  return typeof pn === 'string' ? pn.trim().toUpperCase() : '';
}

/** True for null, undefined and strings that are empty after trimming. */
export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/** The lowercased text after the first '@' of an address; '' when there is none. */
export function emailDomain(address: string): string {
  if (typeof address !== 'string') return '';
  return (address.split('@')[1] ?? '').trim().toLowerCase();
}

/** Classic Levenshtein edit distance (insertion, deletion and substitution each cost 1). */
export function levenshtein(a: string, b: string): number {
  const left = typeof a === 'string' ? a : '';
  const right = typeof b === 'string' ? b : '';
  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previousRow[0];
    previousRow[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previousRow[j];
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      previousRow[j] = Math.min(previousRow[j] + 1, previousRow[j - 1] + 1, diagonal + substitutionCost);
      diagonal = above;
    }
  }
  return previousRow[right.length];
}

/** Escapes every regex metacharacter so `text` matches literally inside a RegExp. */
export function escapeRegExp(text: string): string {
  return String(text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The parsed region of a doc: its text before the quoted history marker (all of it when there is none). */
export function parsedText(doc: SourceDoc): string {
  const text = typeof doc.text === 'string' ? doc.text : '';
  return doc.historyStart === undefined ? text : text.slice(0, doc.historyStart);
}

/** Finds `needle` case-insensitively in the parsed region of `doc`, at or after `fromIndex`. */
export function findSpan(doc: SourceDoc, needle: string, fromIndex = 0): Span | undefined {
  if (typeof needle !== 'string' || needle === '') return undefined;
  const region = parsedText(doc);
  const searchFrom = Math.min(Math.max(0, Math.trunc(fromIndex) || 0), region.length);
  const offset = region.slice(searchFrom).search(new RegExp(escapeRegExp(needle), 'i'));
  if (offset < 0) return undefined;
  const start = searchFrom + offset;
  return { docKey: doc.key, start, end: start + needle.length };
}

/** Adds whole days to the YYYY-MM-DD part of an ISO date or date-time, in UTC; '' when the date is unreadable. */
export function addDaysIso(isoDateOrDateTime: string, days: number): string {
  const dateMatch = typeof isoDateOrDateTime === 'string' ? ISO_DATE_PREFIX_PATTERN.exec(isoDateOrDateTime) : null;
  if (!dateMatch || !Number.isFinite(days)) return '';
  const year = Number(dateMatch[1]);
  const monthIndex = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]) + Math.trunc(days);
  const shifted = new Date(Date.UTC(year, monthIndex, day));
  return Number.isNaN(shifted.getTime()) ? '' : shifted.toISOString().slice(0, 10);
}
