// Evidence drawer for the Customer view: a modal right sheet that leads with the exact line of the vendor's quote
// behind one price, then any issues on that price in plain words, then the full thread. One scroll region.
// Presentational: it never runs a rule or writes to the store; vendor text renders only as React text.

import clsx from 'clsx';
import { X } from 'lucide-react';
import { useId, useRef } from 'react';
import type { Flag, Trust } from '../../domain/types';
import { formatApproxUsd, formatLeadTime, formatMoney, formatQty, shortVendorName } from '../shared/format';
import { CUSTOMER_DOC_ROLE_LABELS, CUSTOMER_ISSUE_STATE_LABELS, CUSTOMER_RULE_LABELS } from '../shared/labels';
import { Disclosure, ItemLabel } from '../shared/primitives';
import { describeSourceDoc } from '../shared/reviewLookups';
import { SourcePane } from '../shared/SourcePane';
import { customerIssueState, scopeIssues, type ResolvedEvidence } from './customerView';
import { useDialogFocus } from './useDialogFocus';

/** One sentence on how far the price can be trusted, in the customer's words. */
const TRUST_CAPTIONS: Record<Trust, { text: string; className: string }> = {
  verified: { text: 'Matches the highlighted line in the vendor\'s quote.', className: 'text-emerald-700' },
  corrected: { text: 'Corrected from the highlighted line in the vendor\'s quote.', className: 'text-blue-700' },
  'open-issue': { text: 'Being confirmed against the vendor\'s quote.', className: 'text-amber-700' },
  unverified: { text: 'Not yet checked against the vendor\'s quote.', className: 'text-zinc-500' },
};

/** Props: the resolved quote to show and how to close the sheet. */
export interface EvidenceDrawerProps { evidence: ResolvedEvidence; onClose: () => void }

/** A modal right sheet with one quote's source line, its open issues and the vendor's full email. */
export function EvidenceDrawer({ evidence, onClose }: EvidenceDrawerProps) {
  const { row, cell, review } = evidence;
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useDialogFocus(sheetRef, closeButtonRef, onClose);

  const { onThisPrice, elsewhere } = scopeIssues(review, cell, row);
  const doc = cell.evidence ? review.docs.find((candidate) => candidate.key === cell.evidence?.docKey) : undefined;
  const excerpt = doc && cell.evidence ? doc.text.slice(cell.evidence.start, cell.evidence.end) : undefined;
  const isConverted = cell.currency !== 'USD';
  const caption = TRUST_CAPTIONS[cell.trust];

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40 bg-zinc-900/30" onClick={onClose} />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-y-0 right-0 z-50 flex w-[min(720px,92vw)] flex-col bg-white shadow-xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold text-zinc-900">
              {shortVendorName(review.vendor.name)} <span className="text-zinc-300">·</span>
              <ItemLabel rfqNo={row.rfqNo} partNumber={row.partNumber} /> <span className="text-zinc-300">·</span> {formatQty(row.qty)} pcs
            </h2>
            <p className="mt-1 text-[13px] text-zinc-600">
              {cell.usd === null ? 'No price yet' : `${isConverted ? formatApproxUsd(cell.usd) : formatMoney(cell.usd)} per unit`}
              {isConverted && cell.unitCost !== null && ` (${formatMoney(cell.unitCost, cell.currency)})`}
              {` · ${formatLeadTime(cell.leadTime, 'long')}`}
              {row.bestVendorId === cell.vendorId && <span className="font-medium text-emerald-700"> · Recommended</span>}
            </p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close evidence" className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
            <X aria-hidden className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section aria-label="Source line" className="space-y-2 px-6 py-5">
            {excerpt && doc ? (
              <>
                <p className="text-[12px] text-zinc-500">From {describeSourceDoc(doc)}</p>
                <blockquote className="whitespace-pre-wrap border-l-2 border-emerald-600 bg-zinc-50 px-3 py-2 font-mono text-[12px] text-zinc-900">{excerpt}</blockquote>
                <p className={clsx('text-[12px]', caption.className)}>{caption.text}</p>
              </>
            ) : (
              <p className="text-[13px] text-zinc-500">No single line of the vendor's quote backs this price yet.</p>
            )}
          </section>

          {(onThisPrice.length > 0 || elsewhere.length > 0) && (
            <section aria-label="Notes on this quote" className="space-y-3 border-t border-zinc-100 px-6 py-4">
              {onThisPrice.length > 0 && <IssueList title="On this price" flags={onThisPrice} />}
              {elsewhere.length > 0 && (
                <Disclosure summary={`${elsewhere.length} ${elsewhere.length === 1 ? 'note' : 'notes'} on other quantities or the whole quote`}>
                  <IssueList flags={elsewhere} />
                </Disclosure>
              )}
            </section>
          )}

          <section aria-label="Vendor's quote" className="border-t border-zinc-200 px-6 py-4">
            <Disclosure summary="Show it in the full thread">
              <div className="-mx-6 border-t border-zinc-100">
                <SourcePane docs={review.docs} highlights={[]} selectedSpan={cell.evidence} roleLabels={CUSTOMER_DOC_ROLE_LABELS} />
              </div>
            </Disclosure>
          </section>
        </div>
      </div>
    </>
  );
}

/** Issues as the customer reads them: a status word and one plain sentence, deduplicated by meaning. */
function IssueList({ title, flags }: { title?: string; flags: Flag[] }) {
  const lines = [...new Map(flags.map((flag) => [`${customerIssueState(flag)}|${flag.rule}`, flag])).values()];
  return (
    <div>
      {title && <h3 className="mb-1.5 text-[12px] font-medium text-zinc-600">{title}</h3>}
      <ul className="space-y-1.5">
        {lines.map((flag) => {
          const state = customerIssueState(flag);
          return (
            <li key={flag.id} className="flex gap-3 text-[13px]">
              <span className={clsx('w-32 shrink-0 text-[12px] font-medium', state === 'note' ? 'text-zinc-500' : 'text-amber-700')}>{CUSTOMER_ISSUE_STATE_LABELS[state]}</span>
              <span className="text-zinc-800">{CUSTOMER_RULE_LABELS[flag.rule]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
