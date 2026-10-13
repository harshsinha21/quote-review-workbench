// One issue as Expected, Answered and the Discrepancy between them, each side naming its source.
// Sources: our RFQ, the vendor's email or PDF, our terms, the requirement, or the extraction.
// Spans only, so it can sit inside a button. Props in; no store access, no rule logic.

import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { Category, Flag, Severity, SourceDoc, VendorReview } from '../../domain/types';
import { formatShortDate } from './format';

/** A value in the vendor's own break format ("qty 100: USD 1.74 ea / ...") reads in monospace, like the email. */
const BREAK_LINE_PATTERN = /^qty \d+:/;

/** The discrepancy reads in its severity's color, so a blocker is red at a glance. */
const DISCREPANCY_TONES: Record<Severity, string> = { blocker: 'text-red-700', warning: 'text-amber-800', info: 'text-zinc-700' };

/** "our RFQ, May 12", "Mike Henderson's email, May 14", "apex-quote-Q-AC-44218.pdf, May 15". */
function describeDoc(doc: SourceDoc | undefined, fallback: string): string {
  if (!doc) return fallback;
  if (doc.role === 'rfq') return `our RFQ, ${formatShortDate(doc.date)}`;
  const name = doc.attachment ? doc.attachment.filename : `${doc.fromName || 'the vendor'}'s email`;
  return `${name}, ${formatShortDate(doc.date)}`;
}

/** Where the expected and the answered side of an issue come from, by the kind of check. */
function sourcesOf(flag: Flag, review: VendorReview): [string, string] {
  const reply = describeDoc(review.docs.find((doc) => doc.role === 'quote'), "the vendor's reply");
  const rfq = describeDoc(review.docs.find((doc) => doc.role === 'rfq'), 'our RFQ');
  const sources: Record<Category, [string, string]> = {
    extraction: [reply, 'the extraction'],
    coverage: [rfq, reply],
    commercial: ['our terms', reply],
    compliance: ['the requirement', reply],
  };
  return sources[flag.category];
}

/**
 * Expected, Answered and Discrepancy. The full form stacks each label (with its source) over its value, so values
 * get the whole width and the expected and answered lines sit directly under each other. `compact` is two short
 * label/value rows without sources, for lists where the issue's title already states the discrepancy.
 */
export function IssueComparison({ flag, review, compact = false, className }: {
  flag: Flag; review: VendorReview; compact?: boolean; className?: string;
}) {
  if (!flag.expected && !flag.answered) return null;
  if (compact) {
    return (
      <span className={clsx('grid grid-cols-[64px_minmax(0,1fr)] gap-x-2 text-[12px] leading-[18px]', className)}>
        <span className="text-zinc-500">Expected</span><span className="text-zinc-800">{flag.expected || '—'}</span>
        <span className="text-zinc-500">Answered</span><span className="text-zinc-800">{flag.answered || '—'}</span>
      </span>
    );
  }
  const [expectedSource, answeredSource] = sourcesOf(flag, review);
  const part = (label: string, source: string | undefined, value: ReactNode) => (
    <span className="block">
      <span className="block text-[11px] font-medium text-zinc-500">
        {label}{source && <span className="font-normal text-zinc-400"> · {source}</span>}
      </span>
      <span className="block text-[12px] leading-[18px]">{value}</span>
    </span>
  );
  return (
    <span className={clsx('block space-y-2', className)}>
      {part('Expected', expectedSource, <Value text={flag.expected} />)}
      {part('Answered', answeredSource, <Value text={flag.answered} />)}
      {flag.discrepancy && part('Discrepancy', undefined,
        <span className={clsx('font-medium', DISCREPANCY_TONES[flag.severity])}>{flag.discrepancy}</span>)}
    </span>
  );
}

/** One side's value: monospace when it is a quoted break line, so it mirrors the email; "—" when absent. */
function Value({ text }: { text: string | undefined }) {
  return <span className={clsx('text-zinc-900', text && BREAK_LINE_PATTERN.test(text) && 'font-mono text-[12px]')}>{text || '—'}</span>;
}
