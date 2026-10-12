// App shell: top bar, role-specific nav, the active view inside an error boundary, and toasts.
// Routing is the store's role + view; there is no router.

import type { ReactNode } from 'react';
import { type StorageIssue, type View, useReview } from './store/useReview';
import { CustomerSummary } from './ui/customer/CustomerSummary';
import { Correspondence } from './ui/customer/Correspondence';
import { CompareAndPo } from './ui/ops/CompareAndPo';
import { FollowUps } from './ui/ops/FollowUps';
import { OpsOverview } from './ui/ops/OpsOverview';
import { VendorReview } from './ui/ops/VendorReview';
import { Banner, Button } from './ui/shared/primitives';
import { ErrorBoundary } from './ui/shell/ErrorBoundary';
import { Sidebar } from './ui/shell/Sidebar';
import { Toasts } from './ui/shell/Toasts';
import { TopBar } from './ui/shell/TopBar';
import { VendorPortal } from './ui/vendor/VendorPortal';

/** Screen component per view. */
const VIEWS: Record<View, () => ReactNode> = {
  overview: OpsOverview,
  'vendor-review': VendorReview,
  'follow-ups': FollowUps,
  compare: CompareAndPo,
  summary: CustomerSummary,
  correspondence: Correspondence,
  portal: VendorPortal,
};

/** Banner text per storage problem. */
const STORAGE_MESSAGES: Record<StorageIssue, string> = {
  unreadable: 'Saved review data could not be read, so this session started with an empty review.',
  corrupt: 'Saved review data was damaged, so this session started with an empty review.',
  unwritable: 'Review decisions cannot be saved in this browser. They will be lost on reload; export JSON to keep them.',
};

/** The whole app. */
export function App() {
  const role = useReview((state) => state.role);
  const view = useReview((state) => state.view);
  const vendorId = useReview((state) => state.vendorId);
  const storageIssue = useReview((state) => state.storageIssue);
  const dismissStorageIssue = useReview((state) => state.dismissStorageIssue);
  const resetAll = useReview((state) => state.resetAll);
  const ActiveView = VIEWS[view];

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      {storageIssue && (
        <Banner
          tone="warning"
          title={STORAGE_MESSAGES[storageIssue]}
          className="rounded-none border-x-0 border-t-0"
          actions={<Button size="xs" variant="ghost" onClick={dismissStorageIssue}>Dismiss</Button>}
        />
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto">
          <ErrorBoundary key={`${role}:${view}:${vendorId ?? ''}`} onResetData={resetAll}>
            <ActiveView />
          </ErrorBoundary>
        </main>
      </div>
      <Toasts />
    </div>
  );
}
