// Vendor portal preview: what this vendor was asked, what we still need from them, and their quote against the
// request. Shows only this vendor's own data: never other vendors, internal issues, variance or notes.

import { Check } from 'lucide-react';
import { useReview, useReviewModel } from '../../store/useReview';
import { formatShortDate, stripAskPrefix } from '../shared/format';
import { Disclosure, EmptyState, ItemLabel, SectionHeader } from '../shared/primitives';
import { openAsks } from '../shared/reviewLookups';
import { SURFACE, TEXT } from '../shared/styles';
import { RequestVsQuote } from './RequestVsQuote';

/** "Item 3 · MS21042L3" → item number and part number. */
const ASK_SECTION_PATTERN = /^Item (\d+) · (.+)$/;

/** The read-only page one vendor would see. */
export function VendorPortal() {
  const vendorId = useReview((state) => state.vendorId);
  const { vendors } = useReviewModel();
  const review = vendors.find((candidate) => candidate.vendor.id === vendorId) ?? vendors[0];
  if (!review) return <EmptyState>No quote request to show yet.</EmptyState>;
  const asks = openAsks(review);
  const { vendor, rfq } = review;

  return (
    <div className="mx-auto w-full max-w-[800px] px-8 py-10">
      <header className="mb-8">
        <h1 className={TEXT.pageTitle}>Quote request from Argus Defense</h1>
        <p className="mt-1 text-[13px] text-zinc-600">
          Sent to {vendor.contactName || vendor.name} on {formatShortDate(rfq.sentAt)}
          {rfq.dueDate && ` · due ${formatShortDate(rfq.dueDate)}`}
          {review.respondedAt && ` · we received your reply ${formatShortDate(review.respondedAt)}`}
        </p>
      </header>

      <section aria-label="What we still need">
        <SectionHeader className="mb-3" title="What we still need" description={asks.length > 0 ? 'Please reply to our RFQ email with these details.' : undefined} />
        {asks.length === 0 ? (
          <div className={SURFACE}><EmptyState icon={Check} tone="verified">Nothing outstanding. Thank you.</EmptyState></div>
        ) : (
          <ol className={`${SURFACE} divide-y divide-zinc-100`}>
            {asks.map((ask, index) => {
              const sectionMatch = ASK_SECTION_PATTERN.exec(ask.section);
              return (
                <li key={ask.flagIds.join('|') || index} className="flex gap-4 px-5 py-3 text-[13px]">
                  <span className="w-5 shrink-0 tabular-nums text-zinc-400">{index + 1}</span>
                  <span className="w-40 shrink-0 text-[12px] text-zinc-500">
                    {sectionMatch ? <ItemLabel rfqNo={Number(sectionMatch[1])} partNumber={sectionMatch[2]} /> : ask.section}
                  </span>
                  <span className="min-w-0 text-zinc-900">{stripAskPrefix(ask.text)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <Disclosure className="mt-8" summary="Your full quote compared with our request">
        <div className={`${SURFACE} overflow-hidden`}>
          <RequestVsQuote review={review} />
        </div>
      </Disclosure>
    </div>
  );
}
