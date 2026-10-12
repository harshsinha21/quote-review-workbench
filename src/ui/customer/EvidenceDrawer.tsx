// Evidence drawer for the Customer view: a modal right sheet with one vendor's quote for one item and
// break, its open issues in plain language, and the vendor's own documents with the line highlighted.
// Presentational: it never runs a rule or writes to the store; vendor text renders only as React text.

import { CircleCheck, X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import type { Flag } from '../../domain/types';
import { CUSTOMER_RULE_LABELS } from '../shared/labels';
import { Badge, Mono, SeverityBadge, TrustChip } from '../shared/primitives';
import { SourcePane, type SourcePaneProps } from '../shared/SourcePane';
import { findOpenIssues, formatLeadTime, type ResolvedEvidence } from './customerView';
import { UnitPrice } from './RecommendationTable';
import { useDialogFocus } from './useDialogFocus';

/** Wording for a rule the customer labels do not know yet (the engine may add rules). */
const FALLBACK_ISSUE_LABEL = 'A detail of this quote is still being reviewed';

/** Props for EvidenceDrawer: the resolved quote to show and how to close the sheet. */
export interface EvidenceDrawerProps {
  evidence: ResolvedEvidence;
  description?: string;     // the item description, when a quote gave one
  onClose: () => void;      // called by Escape, the close button and the dimmed overlay
}

/** A modal right sheet with one quote's price, its open issues and the vendor's source text. */
export function EvidenceDrawer({ evidence, description, onClose }: EvidenceDrawerProps) {
  const { row, cell, review } = evidence;
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useDialogFocus(sheetRef, closeButtonRef, onClose);

  const { partIssues, quoteIssues } = findOpenIssues(review, cell.productId, row.rfqNo);
  const highlights: SourcePaneProps['highlights'] = cell.evidence ? [{ span: cell.evidence, tone: 'verified' }] : [];
  const isRecommended = row.bestVendorId === cell.vendorId;
  const hasIssues = partIssues.length > 0 || quoteIssues.length > 0;

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40 bg-zinc-900/30" onClick={onClose} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-y-0 right-0 z-50 flex w-[min(720px,90vw)] flex-col border-l border-zinc-200 bg-white shadow-xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-[15px] font-semibold text-zinc-900">
              {review.vendor.name} · Item {row.rfqNo} · {row.qty.toLocaleString('en-US')} pcs
            </h2>
            <p className="mt-1 flex min-w-0 items-baseline gap-2 text-[12px] text-zinc-500">
              <Mono className="shrink-0 text-zinc-700">{row.partNumber}</Mono>
              {description && <span className="truncate">{description}</span>}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close evidence"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <X aria-hidden className="size-4" />
          </button>
        </header>

        <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-zinc-200 px-5 py-4">
          <dl className="grid grid-cols-3 gap-4">
            <Fact label="Unit price">
              <span className="text-[18px]"><UnitPrice cell={cell} align="start" /></span>
            </Fact>
            <Fact label="Lead time">
              <span className="text-[18px] font-medium tabular-nums text-zinc-900">{formatLeadTime(cell.leadTime)}</span>
            </Fact>
            <Fact label="Status">
              <span className="flex flex-wrap items-center gap-1.5">
                <TrustChip trust={cell.trust} />
                {isRecommended && <Badge tone="accent">Recommended</Badge>}
              </span>
            </Fact>
          </dl>

          {hasIssues ? (
            <>
              <IssueList title="Open issues on this part" flags={partIssues} />
              <IssueList title="Open issues on the whole quote" flags={quoteIssues} />
            </>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-[13px] text-emerald-700">
              <CircleCheck aria-hidden className="size-4 shrink-0 text-emerald-600" />
              No open issues on this quote.
            </p>
          )}
        </div>

        <section aria-label="Vendor source documents" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600">
          {!cell.evidence && (
            <p className="border-b border-zinc-200 bg-zinc-50 px-5 py-2 text-[12px] text-zinc-600">
              The exact line for this price could not be pinpointed, so the vendor's full thread is shown.
            </p>
          )}
          <SourcePane docs={review.docs} highlights={highlights} selectedSpan={cell.evidence} />
        </section>
      </div>
    </>
  );
}

/** One labelled figure in the quote summary at the top of the sheet. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Open issues in plain language, one per kind of problem (the most severe one is kept). */
function IssueList({ title, flags }: { title: string; flags: Flag[] }) {
  const issues = keepFirstPerRule(flags);
  if (issues.length === 0) return null;
  return (
    <section className="mt-4">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</h3>
      <ul className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-200">
        {issues.map((flag) => (
          <li key={flag.id} className="flex items-start gap-3 px-3 py-2 text-[13px] text-zinc-800">
            <SeverityBadge severity={flag.severity} className="mt-px shrink-0" />
            <span>{CUSTOMER_RULE_LABELS[flag.rule] ?? FALLBACK_ISSUE_LABEL}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Drops repeat flags of the same rule; input is sorted most severe first, so the worst one stays. */
function keepFirstPerRule(flags: Flag[]): Flag[] {
  const seenRules = new Set<string>();
  return flags.filter((flag) => {
    if (seenRules.has(flag.rule)) return false;
    seenRules.add(flag.rule);
    return true;
  });
}
