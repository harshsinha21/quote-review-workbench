// The Ops hero screen for one vendor: a header with the blocker gate, then issues, extracted values and the vendor's source side by side.
// Reads the store and useReviewModel only and never computes rules; vendor text renders as React text, never innerHTML.

import clsx from 'clsx';
import { CalendarX, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Flag, Severity, Span, VendorReview as VendorReviewData } from '../../domain/types';
import { useReview, useReviewModel } from '../../store/useReview';
import { formatDate, formatShortDate, pluralize, shortVendorName } from '../shared/format';
import { Banner, Button, EmptyState, MetaItem, MetaLine, Mono, StatusText, Tabs } from '../shared/primitives';
import { QuoteTable } from '../shared/QuoteTable';
import { SourcePane } from '../shared/SourcePane';
import { TEXT } from '../shared/styles';
import { IssuesPanel } from './IssuesPanel';
import { orderIssues } from './issueOrder';

/** What fills the right area below 1440px (at 1440px and up both show side by side). */
type RightTab = 'extracted' | 'source';

/** The hero screen for the selected vendor, or a way back when there is none. */
export function VendorReview() {
  const vendorId = useReview((state) => state.vendorId);
  const setView = useReview((state) => state.setView);
  const review = useReviewModel().vendors.find((candidate) => candidate.vendor.id === vendorId);
  if (!review) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <EmptyState>{vendorId ? 'This vendor is not in the review data.' : 'No vendor selected.'}</EmptyState>
        <Button onClick={() => setView('overview')}>Back to overview</Button>
      </div>
    );
  }
  return <VendorReviewScreen key={review.vendor.id} review={review} />;
}

/** The loaded screen for one vendor; keyed by vendor, so it remounts (and auto-selects) on every switch. */
function VendorReviewScreen({ review }: { review: VendorReviewData }) {
  const selectedFlagId = useReview((state) => state.selectedFlagId);
  const selectedLineId = useReview((state) => state.selectedLineId);
  const selectedSpan = useReview((state) => state.selectedSpan);
  const decisions = useReview((state) => state.overlay.decisions);
  const submittedAt = useReview((state) => state.overlay.submittedAt[review.vendor.id]);
  const { select, applyFix, accept, exclude, undo, setView, markVerified, openVendorReview } = useReview.getState();
  const otherVendors = useReviewModel().vendors.filter((candidate) => candidate.vendor.id !== review.vendor.id);
  const [rightTab, setRightTab] = useState<RightTab>('source');
  const isAdvancePending = useRef(false);
  const ordered = useMemo(() => orderIssues(review.open), [review.open]);
  const highlights = useMemo(
    () => review.open.flatMap((flag): { span: Span; tone: Severity }[] => (flag.evidence ? [{ span: flag.evidence, tone: flag.severity }] : [])),
    [review.open],
  );
  const selectFlag = (flag: Flag | undefined) => flag && select({ flagId: flag.id, lineId: flag.lineId, span: flag.evidence });

  // On arrival, and after every resolving action, put the first open issue in front of the operator.
  // Keyed on the open list only: a table-row click changes the selection and must not trigger a re-select.
  useEffect(() => {
    const state = useReview.getState();
    const isArrival = state.selectedFlagId === undefined && state.selectedLineId === undefined;
    if (!isArrival && !isAdvancePending.current) return;
    isAdvancePending.current = false;
    const first = ordered[0];
    if (first) state.select({ flagId: first.id, lineId: first.lineId, span: first.evidence });
  }, [ordered]);

  const resolveThen = (resolve: () => boolean | void) => {
    if (resolve() !== false) isAdvancePending.current = true;
  };
  const blockers = ordered.filter((flag) => flag.severity === 'blocker');
  const nextBlocker = () => {
    const index = blockers.findIndex((flag) => flag.id === selectedFlagId);
    selectFlag(blockers[(index + 1) % blockers.length]);
  };
  const vendorWithBlockers = otherVendors.find((candidate) => candidate.counts.blocker > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <VendorHeader
        review={review}
        submittedAt={submittedAt ?? review.vendor.submittedAt ?? undefined}
        onNextBlocker={nextBlocker}
        onFollowUp={() => setView('follow-ups', review.vendor.id)}
        onMarkVerified={() => markVerified(review.vendor.id)}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] min-[1440px]:grid-cols-[340px_minmax(500px,1.3fr)_minmax(360px,1fr)]">
        <aside aria-label="Issues" className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
          <IssuesPanel
            review={review}
            decisions={decisions}
            selectedFlagId={selectedFlagId}
            onSelectFlag={selectFlag}
            onApplyFix={(flag) => resolveThen(() => applyFix(flag))}
            onAccept={(flag, note) => {
              const isAccepted = accept(flag, note);
              if (isAccepted) isAdvancePending.current = true;
              return isAccepted;
            }}
            onExclude={(flag) => resolveThen(() => exclude(flag))}
            onUndo={undo}
            nextVendor={vendorWithBlockers && {
              name: shortVendorName(vendorWithBlockers.vendor.name),
              blockerCount: vendorWithBlockers.counts.blocker,
              onOpen: () => openVendorReview(vendorWithBlockers.vendor.id),
            }}
          />
        </aside>
        {/* Below 1440px this wrapper holds the Source | Extracted tabs; at 1440px and up it dissolves into two columns. */}
        <div className="flex min-h-0 min-w-0 flex-col bg-white min-[1440px]:contents">
          <Tabs
            label="Source or extracted"
            className="shrink-0 px-4 min-[1440px]:hidden"
            value={rightTab}
            onChange={(id) => setRightTab(id as RightTab)}
            items={[{ id: 'source', label: 'Source' }, { id: 'extracted', label: 'Extracted' }]}
          />
          <section aria-label="Extracted values" className={clsx('relative min-h-0 min-w-0 overflow-auto bg-white min-[1440px]:block min-[1440px]:border-r min-[1440px]:border-zinc-200', rightTab === 'extracted' ? 'flex-1' : 'hidden')}>
            <QuoteTable review={review} selectedLineId={selectedLineId} onSelectLine={(lineId, span) => select({ lineId, span })} />
          </section>
          <section aria-label="Vendor's quote" className={clsx('relative min-h-0 min-w-0 overflow-y-auto bg-white min-[1440px]:block', rightTab === 'source' ? 'flex-1' : 'hidden')}>
            <SourcePane
              docs={review.docs}
              highlights={highlights}
              selectedSpan={selectedSpan}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

/** Vendor identity and terms as one quiet line, and the gate: blockers left with "Next blocker", or "Mark verified". */
function VendorHeader({ review, submittedAt, onNextBlocker, onFollowUp, onMarkVerified }: {
  review: VendorReviewData; submittedAt?: string; onNextBlocker: () => void; onFollowUp: () => void; onMarkVerified: () => void;
}) {
  const { vendor } = review;
  const blockerCount = review.counts.blocker;
  const currencies = [...new Set(review.products.flatMap((productReview) => productReview.lines.map((lineReview) => lineReview.line.currency)).filter(Boolean))];
  return (
    <header className="shrink-0 border-b border-zinc-200 bg-white px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className={TEXT.pageTitle}>{vendor.name}</h1>
          <MetaLine className="mt-1">
            {vendor.contactEmail
                ? <a href={`mailto:${encodeURIComponent(vendor.contactEmail)}`} title={vendor.contactEmail} className="text-zinc-800 hover:text-blue-700 hover:underline">{vendor.contactName || vendor.contactEmail}</a>
                : vendor.contactName}
            {vendor.cage && <span>CAGE <Mono className="text-zinc-800">{vendor.cage}</Mono></span>}
            {vendor.paymentTerms && <MetaItem label="Terms">{vendor.paymentTerms}</MetaItem>}
            {review.validUntil && (
                <span className={clsx(review.expired && 'inline-flex items-center gap-1 text-amber-700')}>
                  {review.expired && <CalendarX aria-hidden className="size-3.5" />}
                  Valid until {formatDate(review.validUntil)}{review.expired ? ' (expired)' : ''}
                </span>
              )}
            {currencies.some((currency) => currency !== 'USD') && <span>Quoted in {currencies.join(', ')}</span>}
            {review.sourceLabel && <MetaItem label="Source">{review.sourceLabel}</MetaItem>}
          </MetaLine>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button size="md" onClick={onFollowUp}>Draft follow-up</Button>
          {review.status === 'submitted' ? (
            <StatusText tone="verified" icon={ShieldCheck}>Verified{submittedAt ? ` ${formatShortDate(submittedAt)}` : ''}</StatusText>
          ) : blockerCount > 0 ? (
            <>
              <span className="text-[12px] font-medium text-red-700">{pluralize(blockerCount, 'blocker')} left</span>
              <Button size="md" variant="primary" onClick={onNextBlocker}>Next blocker</Button>
            </>
          ) : (
            <Button size="md" variant="primary" icon={ShieldCheck} onClick={onMarkVerified}>Mark verified</Button>
          )}
        </div>
      </div>
      {review.hasParsedSource === false && (
        <Banner className="mt-3" title="Could not auto-verify this reply. Check values against the source." />
      )}
    </header>
  );
}
