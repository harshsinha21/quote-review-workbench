// Customer "Emails": the RFQ once, then each vendor's thread as a quiet inbox (the current quote open, the rest
// folded). Reuses SourcePane with customer wording; read-only, vendor text renders only as React text.

import clsx from 'clsx';
import { useReviewModel } from '../../store/useReview';
import { formatShortDate, pluralize } from '../shared/format';
import { CUSTOMER_DOC_ROLE_LABELS } from '../shared/labels';
import { EmptyState, SectionHeader } from '../shared/primitives';
import { SourcePane } from '../shared/SourcePane';
import { SURFACE } from '../shared/styles';
import { CustomerPage } from './CustomerPage';

/** Every email in the RFQ, grouped by vendor. */
export function Correspondence() {
  const { vendors } = useReviewModel();
  const rfqDoc = vendors[0]?.docs.find((doc) => doc.role === 'rfq');
  return (
    <CustomerPage>
      {vendors.length === 0 && <div className={SURFACE}><EmptyState>No emails yet.</EmptyState></div>}
      <div className="space-y-8">
        {rfqDoc && (
          <section aria-label="Our request">
            <SectionHeader className="mb-3" title="Our request" description={`Sent ${formatShortDate(rfqDoc.date)} to ${pluralize(vendors.length, 'vendor')}`} />
            <div className={clsx(SURFACE, 'overflow-hidden')}>
              <SourcePane docs={[rfqDoc]} highlights={[]} roleLabels={CUSTOMER_DOC_ROLE_LABELS} />
            </div>
          </section>
        )}
        {vendors.map((review) => {
          const replies = review.docs.filter((doc) => doc.role !== 'rfq');
          const emailCount = new Set(replies.map((doc) => doc.emailId)).size;
          return (
            <section key={review.vendor.id} aria-label={`${review.vendor.name} emails`}>
              <SectionHeader className="mb-3" title={review.vendor.name} description={pluralize(emailCount, 'reply', 'replies')} />
              <div className={clsx(SURFACE, 'overflow-hidden')}>
                <SourcePane docs={replies} highlights={[]} roleLabels={CUSTOMER_DOC_ROLE_LABELS} />
              </div>
            </section>
          );
        })}
      </div>
    </CustomerPage>
  );
}
