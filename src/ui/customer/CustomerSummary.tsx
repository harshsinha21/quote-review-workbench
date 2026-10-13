// Customer "Summary": one status block that answers "is my quote ready?", the recommended price per break, and the
// evidence drawer for any price. Reads the model; never recomputes rules.

import clsx from 'clsx';
import { CalendarX, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { ReviewModel } from '../../domain/types';
import { useReviewModel } from '../../store/useReview';
import { formatShortDate } from '../shared/format';
import { ProgressBar, StatusText } from '../shared/primitives';
import { SURFACE } from '../shared/styles';
import { CustomerPage } from './CustomerPage';
import { findEarliestExpiry, resolveEvidence, type EvidenceTarget } from './customerView';
import { EvidenceDrawer } from './EvidenceDrawer';
import { RecommendationTable } from './RecommendationTable';

/** The customer summary screen. */
export function CustomerSummary() {
  const model = useReviewModel();
  const [target, setTarget] = useState<EvidenceTarget>();
  const evidence = resolveEvidence(model, target);
  return (
    <CustomerPage>
      <StatusSummary model={model} />
      <RecommendationTable model={model} openTarget={target} onOpenEvidence={setTarget} />
      {evidence && <EvidenceDrawer evidence={evidence} onClose={() => setTarget(undefined)} />}
    </CustomerPage>
  );
}

/** "24 of 27 price breaks have a verified, compliant quote", a bar, and what is still pending. */
function StatusSummary({ model }: { model: ReviewModel }) {
  const sourcedCount = model.compare.filter((row) => row.bestVendorId).length;
  const waitingCount = model.compare.length - sourcedCount;
  const earliest = findEarliestExpiry(model.vendors);
  return (
    <section aria-label="Quote status" className={clsx(SURFACE, 'px-6 py-5')}>
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-[32px] font-semibold leading-none tracking-tight text-zinc-900">{sourcedCount} of {model.compare.length}</span>
        <span className="text-[15px] text-zinc-700">price breaks have a verified, compliant quote</span>
      </p>
      <ProgressBar className="mt-4" value={sourcedCount} total={model.compare.length} label="Price breaks with a verified quote" />
      {(waitingCount > 0 || earliest?.isExpired) && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          {waitingCount > 0 && <StatusText tone="warning" icon={TriangleAlert}>{waitingCount} waiting on vendors</StatusText>}
          {earliest?.isExpired && (
            <StatusText tone="warning" icon={CalendarX}>Quotes expired {formatShortDate(earliest.date)}; pricing is being reconfirmed</StatusText>
          )}
        </div>
      )}
    </section>
  );
}
