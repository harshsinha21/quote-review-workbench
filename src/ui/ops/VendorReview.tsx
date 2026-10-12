// The Ops hero screen for one vendor: header with terms and the submit gate, then source, quote and issues side by side.
// Reads the store and useReviewModel only and never computes rules; vendor text renders as React text, never innerHTML.

import clsx from 'clsx';
import { FileText, Mail, OctagonX, ShieldCheck } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import type { RuleId, Severity, Span, VendorReview as VendorReviewData } from '../../domain/types';
import { useReview, useReviewModel } from '../../store/useReview';
import { formatDate, formatShortDate } from '../shared/format';
import { RULE_LABELS } from '../shared/labels';
import { Badge, Banner, Button, EmptyState, Mono } from '../shared/primitives';
import { QuoteTable } from '../shared/QuoteTable';
import { SourcePane } from '../shared/SourcePane';
import { IssuesPanel } from './IssuesPanel';

/** Which panel fills the right area below 1440px (at 1440px and up both show side by side). */
type RightTab = 'quote' | 'issues';
/** One tinted range in the source pane. */
interface Highlight { span: Span; tone: Severity | 'verified' }

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

/** Source highlights: open flags tinted by severity, plus every source line the extraction matched exactly. */
function buildHighlights(review: VendorReviewData): Highlight[] {
  const flagHighlights = review.open.flatMap((flag): Highlight[] =>
    flag.evidence ? [{ span: flag.evidence, tone: flag.severity }] : []);
  const verifiedHighlights = review.products.flatMap((product) =>
    product.lines.flatMap((lineReview): Highlight[] =>
      lineReview.status === 'verified' && lineReview.source ? [{ span: lineReview.source.span, tone: 'verified' }] : []));
  return [...flagHighlights, ...verifiedHighlights];
}

/** Tooltip for a disabled "Mark verified": "3 open blockers: Dropped value (2), FAT flag differs from email". */
function describeOpenBlockers(review: VendorReviewData): string {
  const countsByRule = new Map<RuleId, number>();
  for (const flag of review.open) {
    if (flag.severity === 'blocker') countsByRule.set(flag.rule, (countsByRule.get(flag.rule) ?? 0) + 1);
  }
  const total = Array.from(countsByRule.values()).reduce((sum, count) => sum + count, 0);
  if (total === 0) return 'Resolve every open blocker before marking verified.';
  const parts = Array.from(countsByRule, ([rule, count]) => {
    const label = RULE_LABELS[rule] ?? rule;
    return count > 1 ? `${label} (${count})` : label;
  });
  return `${total} open blocker${total === 1 ? '' : 's'}: ${parts.join(', ')}`;
}

/** Distinct currencies across the quoted lines ("USD", or "USD, EUR"). */
function quoteCurrencies(review: VendorReviewData): string[] {
  const currencies = new Set<string>();
  for (const product of review.products) {
    for (const lineReview of product.lines) {
      if (lineReview.line.currency) currencies.add(lineReview.line.currency);
    }
  }
  return Array.from(currencies);
}

/** The hero screen: source pane, quote table and issues panel for the selected vendor. */
export function VendorReview() {
  const vendorId = useReview((state) => state.vendorId);
  const setView = useReview((state) => state.setView);
  const model = useReviewModel();
  const review = model.vendors.find((candidate) => candidate.vendor.id === vendorId);

  if (!review) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-50 p-6">
        <EmptyState icon={FileText}>
          {vendorId ? 'This vendor is not in the review data.' : 'No vendor selected.'} Pick one from the overview.
        </EmptyState>
        <Button onClick={() => setView('overview')}>Back to overview</Button>
      </div>
    );
  }
  return <VendorReviewScreen key={review.vendor.id} review={review} />;
}

/** The loaded screen for one vendor; split out so its hooks never run conditionally. */
function VendorReviewScreen({ review }: { review: VendorReviewData }) {
  const selectedFlagId = useReview((state) => state.selectedFlagId);
  const selectedLineId = useReview((state) => state.selectedLineId);
  const selectedSpan = useReview((state) => state.selectedSpan);
  const decisions = useReview((state) => state.overlay.decisions);
  const submittedAt = useReview((state) => state.overlay.submittedAt[review.vendor.id]);
  const select = useReview((state) => state.select);
  const setView = useReview((state) => state.setView);
  const applyFix = useReview((state) => state.applyFix);
  const accept = useReview((state) => state.accept);
  const exclude = useReview((state) => state.exclude);
  const undo = useReview((state) => state.undo);
  const markVerified = useReview((state) => state.markVerified);

  const [rightTab, setRightTab] = useState<RightTab>('quote');
  const baseId = useId();
  const quotePanelId = `${baseId}-quote`;
  const issuesPanelId = `${baseId}-issues`;
  const highlights = useMemo(() => buildHighlights(review), [review]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-50">
      <VendorHeader
        review={review}
        submittedAt={submittedAt ?? review.vendor.submittedAt ?? undefined}
        onFollowUp={() => setView('follow-ups')}
        onMarkVerified={() => markVerified(review.vendor.id)}
      />

      <div
        className={clsx(
          'grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] grid-rows-[minmax(0,1fr)]',
          'min-[1440px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_320px]',
        )}
      >
        <section aria-label="Source documents" className="min-h-0 min-w-0 overflow-y-auto border-r border-zinc-200 bg-white">
          <SourcePane docs={review.docs} highlights={highlights} selectedSpan={selectedSpan} />
        </section>

        {/* Below 1440px this wrapper holds the Quote | Issues tabs; at 1440px and up it dissolves into two grid columns. */}
        <div className="flex min-h-0 min-w-0 flex-col min-[1440px]:contents">
          <div
            role="tablist"
            aria-label="Quote or issues"
            className="flex shrink-0 items-end gap-4 border-b border-zinc-200 bg-white px-4 min-[1440px]:hidden"
          >
            <TabButton isActive={rightTab === 'quote'} panelId={quotePanelId} onClick={() => setRightTab('quote')}>
              Quote
            </TabButton>
            <TabButton isActive={rightTab === 'issues'} panelId={issuesPanelId} onClick={() => setRightTab('issues')}>
              Issues <span className="tabular-nums text-zinc-500">({review.open.length})</span>
            </TabButton>
          </div>

          <section
            id={quotePanelId}
            aria-label="Quote"
            className={clsx(
              'min-h-0 min-w-0 overflow-auto bg-white min-[1440px]:block',
              rightTab === 'quote' ? 'flex-1' : 'hidden',
            )}
          >
            <QuoteTable
              review={review}
              audience="ops"
              selectedLineId={selectedLineId}
              onSelectLine={(lineId, span) => select({ lineId, span })}
            />
          </section>

          <aside
            id={issuesPanelId}
            aria-label="Issues"
            className={clsx(
              'min-h-0 min-w-0 flex-col bg-white min-[1440px]:flex min-[1440px]:border-l min-[1440px]:border-zinc-200',
              rightTab === 'issues' ? 'flex flex-1' : 'hidden',
            )}
          >
            <IssuesPanel
              review={review}
              decisions={decisions}
              selectedFlagId={selectedFlagId}
              onSelectFlag={(flag) => select({ flagId: flag.id, lineId: flag.lineId, span: flag.evidence })}
              onApplyFix={applyFix}
              onAccept={accept}
              onExclude={exclude}
              onUndo={undo}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Vendor identity, commercial terms, open counts and the "Mark verified" gate. */
function VendorHeader({ review, submittedAt, onFollowUp, onMarkVerified }: {
  review: VendorReviewData; submittedAt?: string; onFollowUp: () => void; onMarkVerified: () => void;
}) {
  const { vendor } = review;
  const blockerCount = review.counts.blocker;
  const currencies = quoteCurrencies(review);

  return (
    <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[15px] font-semibold leading-5 text-zinc-900">{vendor.name}</h1>
            <ContactLink name={vendor.contactName} email={vendor.contactEmail} />
            <span className="text-[12px] text-zinc-500">
              CAGE <Mono className="text-zinc-800">{vendor.cage || 'n/a'}</Mono>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge title="Payment terms">
              <span className="text-zinc-500">Terms</span>
              {vendor.paymentTerms || 'Not stated'}
            </Badge>
            <Badge title="Quote validity">
              {review.validUntil ? `Valid until ${formatDate(review.validUntil)}` : 'Validity not stated'}
            </Badge>
            {review.expired && <Badge tone="blocker" icon={OctagonX}>Expired</Badge>}
            <Badge title="Quoted currency">
              <span className="text-zinc-500">Currency</span>
              {currencies.length > 0 ? currencies.join(', ') : 'n/a'}
            </Badge>
            {review.sourceLabel && (
              <Badge icon={FileText} title="Where the quoted values were read from">{review.sourceLabel}</Badge>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <p className="flex items-center gap-1.5 text-[12px] tabular-nums text-zinc-600">
            <OctagonX aria-hidden className={clsx('size-3.5', blockerCount > 0 ? 'text-red-600' : 'text-zinc-400')} />
            <span className={clsx(blockerCount > 0 && 'font-medium text-red-700')}>Blockers {blockerCount}</span>
            <span aria-hidden className="text-zinc-300">·</span>
            <span>Open {review.open.length}</span>
          </p>
          <Button size="md" icon={Mail} onClick={onFollowUp}>Follow-up</Button>
          {review.status === 'submitted' ? (
            <Badge tone="verified" icon={ShieldCheck} title={submittedAt ? `Marked verified ${formatDate(submittedAt)}` : undefined}>
              Verified{submittedAt ? ` ${formatShortDate(submittedAt)}` : ''}
            </Badge>
          ) : (
            <Button
              size="md"
              variant="primary"
              icon={ShieldCheck}
              disabledReason={review.canSubmit ? undefined : describeOpenBlockers(review)}
              onClick={onMarkVerified}
            >
              Mark verified
            </Button>
          )}
        </div>
      </div>

      {review.hasParsedSource === false && (
        <Banner className="mt-3" title="Could not auto-verify this reply. Check values against the source." />
      )}
    </header>
  );
}

/** Contact name plus a mailto link; the address is URI-encoded so vendor text cannot shape the URL. */
function ContactLink({ name, email }: { name: string; email: string }) {
  if (!name && !email) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      {name && <span className="text-zinc-700">{name}</span>}
      {email && (
        <a
          href={`mailto:${encodeURIComponent(email)}`}
          className={clsx('inline-flex items-center gap-1 rounded-sm text-blue-700 hover:underline', FOCUS_RING)}
        >
          <Mail aria-hidden className="size-3.5" />
          {email}
        </a>
      )}
    </span>
  );
}

/** One tab of the Quote | Issues switch shown below 1440px. */
function TabButton({ isActive, panelId, onClick, children }: {
  isActive: boolean; panelId: string; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={panelId}
      onClick={onClick}
      className={clsx(
        '-mb-px inline-flex h-9 items-center gap-1 border-b-2 px-0.5 text-[13px] font-medium transition-colors',
        FOCUS_RING,
        isActive ? 'border-blue-700 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800',
      )}
    >
      {children}
    </button>
  );
}
