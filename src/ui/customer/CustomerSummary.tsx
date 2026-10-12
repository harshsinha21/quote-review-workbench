// Customer Summary screen: KPIs, the recommendation table and the evidence drawer for any price.
// Reads the derived review via useReviewModel and only shapes it with customerView selectors;
// it never re-runs a rule and never writes to the store.

import { useMemo, useState } from 'react';
import { useReviewModel } from '../../store/useReview';
import { formatDate } from '../shared/format';
import { SectionHeader } from '../shared/primitives';
import { findEarliestExpiry, groupRowsByItem, resolveEvidence, type EvidenceTarget } from './customerView';
import { EvidenceDrawer } from './EvidenceDrawer';
import { KpiRow } from './KpiRow';
import { RecommendationTable } from './RecommendationTable';

/** Customer KPIs and the recommendation table with evidence. */
export function CustomerSummary() {
  const model = useReviewModel();
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget>();

  const groups = useMemo(() => groupRowsByItem(model), [model]);
  const vendorNames = useMemo(
    () => Object.fromEntries(model.vendors.map((review) => [review.vendor.id, review.vendor.name])),
    [model],
  );
  const vendorOrder = useMemo(() => model.vendors.map((review) => review.vendor.id), [model]);
  const earliestExpiry = useMemo(() => findEarliestExpiry(model.vendors), [model]);

  const sourcedBreakCount = model.compare.filter((row) => row.bestVendorId !== undefined).length;
  const evidence = resolveEvidence(model, evidenceTarget);
  const evidenceDescription = evidence && groups.find((group) => group.item.no === evidence.row.rfqNo)?.description;

  return (
    <div className="mx-auto max-w-[1100px] p-8">
      <header>
        <h1 className="text-[20px] font-semibold tracking-tight text-zinc-900">Quote summary</h1>
        <p className="mt-1 text-[13px] text-zinc-500">
          {model.rfq.subject || 'Request for quote'}
          {model.rfq.dueDate && <> · Due {formatDate(model.rfq.dueDate)}</>}
        </p>
      </header>

      <KpiRow
        className="mt-6"
        partCount={model.rfq.items.length}
        breakCount={model.compare.length}
        sourcedBreakCount={sourcedBreakCount}
        followUpBreakCount={model.compare.length - sourcedBreakCount}
        earliestExpiry={earliestExpiry}
      />

      <section className="mt-8">
        <SectionHeader title="Recommended vendor per price break" className="mb-3">
          <p className="text-[12px] text-zinc-500">Select a price to see it in the vendor's own email.</p>
        </SectionHeader>
        <RecommendationTable
          groups={groups}
          vendorNames={vendorNames}
          vendorOrder={vendorOrder}
          activeTarget={evidence ? evidenceTarget : undefined}
          onOpenEvidence={setEvidenceTarget}
        />
      </section>

      {evidence && (
        <EvidenceDrawer
          evidence={evidence}
          description={evidenceDescription}
          onClose={() => setEvidenceTarget(undefined)}
        />
      )}
    </div>
  );
}
