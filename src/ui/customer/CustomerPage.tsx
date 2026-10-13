// The Customer view's page frame: title, the RFQ in one line, and the Summary | Emails tabs. Shared by both tabs.

import type { ReactNode } from 'react';
import { type View, useReview, useReviewModel } from '../../store/useReview';
import { formatDate } from '../shared/format';
import { PageHeader, Tabs } from '../shared/primitives';

/** Wraps a customer screen with the page header and the tabs between the summary and the emails. */
export function CustomerPage({ children }: { children: ReactNode }) {
  const { rfq } = useReviewModel();
  const view = useReview((state) => state.view);
  const setView = useReview((state) => state.setView);
  const breakCount = rfq.items.reduce((total, item) => total + item.qtys.length, 0);
  return (
    <div className="mx-auto w-full max-w-[1040px] px-8 py-8">
      <PageHeader
        className="mb-4"
        title="Quote summary"
        description={`${rfq.items.length} parts · ${breakCount} price breaks${rfq.dueDate ? ` · due ${formatDate(rfq.dueDate)}` : ''}`}
      />
      <Tabs
        label="Customer view"
        className="mb-6"
        value={view}
        onChange={(id) => setView(id as View)}
        items={[{ id: 'summary', label: 'Summary' }, { id: 'correspondence', label: 'Emails' }]}
      />
      {children}
    </div>
  );
}
